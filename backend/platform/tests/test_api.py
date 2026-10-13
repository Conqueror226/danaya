import os
os.environ['APP_ORIGIN'] = 'http://testserver'
os.environ['COOKIE_SECURE'] = 'false'

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from app.db import Base, Facility, Patient, Record, User, Session, Audit, get_db
from app.main import app
from app.security import hash_password, verify_password

HEADERS = {'Origin':'http://testserver', 'X-Danaya-Request':'1'}
PASSWORD = 'A strong test password 2026!'

@pytest.fixture()
def setup(tmp_path):
    url=os.environ.get('TEST_DATABASE_URL',f'sqlite:///{tmp_path}/test.db')
    engine=create_engine(url, **({'connect_args':{'check_same_thread':False}} if url.startswith('sqlite') else {}))
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    factory=sessionmaker(engine,expire_on_commit=False)
    with factory() as db:
        db.add_all([Facility(id='a',name='A',city='Ouaga'),Facility(id='b',name='B',city='Bobo')])
        db.flush()
        for facility in ['a','b']:
            for role in ['doctor','nurse','admin','pharmacist','lab_tech']:
                db.add(User(email=f'{role}@{facility}.test',name=role,role=role,facility_id=facility,password=hash_password(PASSWORD)))
        db.commit()
    def override():
        with factory() as db: yield db
    app.dependency_overrides[get_db]=override
    def client(role='doctor',facility='a'):
        c=TestClient(app,headers=HEADERS)
        assert c.post('/api/auth/login',json={'email':f'{role}@{facility}.test','password':PASSWORD}).status_code==200
        return c
    yield client,factory
    app.dependency_overrides.clear()
    engine.dispose()


def new_patient(client,**extra):
    response=client.post('/api/patients',json={'first_name':'Awa','last_name':'Exemple',**extra})
    assert response.status_code==201,response.text
    return response.json()


def test_no_unauthenticated_health_data(setup):
    with TestClient(app,headers=HEADERS) as c:
        for path in ['/api/patients','/api/records','/api/transfers','/api/facilities','/api/audit']:
            assert c.get(path).status_code==401
        assert c.post('/api/patients',json={'first_name':'A','last_name':'B'}).status_code==401
        c.cookies.set('danaya_session','forged-token')
        assert c.get('/api/auth/me').status_code==401


def test_login_csrf_logout_and_expiry(setup):
    client,factory=setup
    c=TestClient(app)
    assert c.post('/api/auth/login',json={'email':'doctor@a.test','password':PASSWORD}).status_code==403
    c=client()
    cookie=c.cookies.get('danaya_session')
    with factory() as db:
        stored=db.scalar(select(Session))
        assert stored.id!=cookie and len(stored.id)==64
        stored.expires=0
        db.commit()
    assert c.get('/api/auth/me').status_code==401
    c=client()
    assert c.post('/api/auth/logout').status_code==204
    assert c.get('/api/auth/me').status_code==401


def test_disabled_user_is_rejected_on_existing_session(setup):
    client,factory=setup;c=client()
    with factory() as db:
        u=db.scalar(select(User).where(User.email=='doctor@a.test'));u.active=False;db.commit()
    assert c.get('/api/patients').status_code==401
    assert c.post('/api/auth/login',json={'email':'doctor@a.test','password':PASSWORD}).status_code==401


def test_hospital_boundaries_and_persistence(setup):
    client,factory=setup;a=client();b=client(facility='b');p=new_patient(a,national_id='NH-1')
    assert b.get('/api/patients').json()['total']==0
    assert b.get('/api/patients/'+p['id']).status_code==404
    assert b.post('/api/records',json={'patient_id':p['id'],'kind':'note','data':{'title':'Note','notes':'Test'}}).status_code==404
    assert client().get('/api/patients').json()['items'][0]['id']==p['id']
    with factory() as db: assert db.get(Patient,p['id']) is not None
    assert a.post('/api/patients',json={'first_name':'X','last_name':'Y','facility_id':'b'}).status_code==422


def test_validation_duplicate_and_optimistic_update(setup):
    client,_=setup;c=client();p=new_patient(c,national_id='id-1')
    assert c.post('/api/patients',json={'first_name':'X','last_name':'Y','national_id':'ID-1'}).status_code==409
    for values in [{'first_name':' '},{'date_of_birth':'2999-01-01'},{'date_of_birth':'not-a-date'},{'sex':'bad'}]:
        assert c.post('/api/patients',json={'first_name':'A','last_name':'B',**values}).status_code==422
    assert c.get('/api/patients?limit=-1').status_code==422
    body={'first_name':'Awa','last_name':'Updated','version':p['version']}
    assert c.put('/api/patients/'+p['id'],json=body).status_code==200
    assert c.put('/api/patients/'+p['id'],json=body).status_code==409


def test_clinical_role_matrix(setup):
    client,_=setup;doctor=client();p=new_patient(doctor,phone='sensitive',national_id='sensitive')
    for role in ['nurse','admin','pharmacist','lab_tech']:
        c=client(role)
        assert c.post('/api/records',json={'patient_id':p['id'],'kind':'prescription','data':{'title':'Test','instructions':'Fictitious'}}).status_code==403
    r=doctor.post('/api/records',json={'patient_id':p['id'],'kind':'prescription','data':{'title':'Fictitious treatment','instructions':'Testing only'}}).json()
    pharmacy=client('pharmacist')
    row=pharmacy.get('/api/patients').json()['items'][0]
    assert 'phone' not in row and 'national_id' not in row
    assert row['created_at'] == p['created_at']
    lab_row=client('lab_tech').get('/api/patients/'+p['id']).json()
    assert lab_row['created_at'] == p['created_at'] and 'phone' not in lab_row
    assert pharmacy.post('/api/patients',json={'first_name':'A','last_name':'B'}).status_code==403
    assert pharmacy.get('/api/records?kind=note').status_code==403
    assert client('admin').get('/api/records').json()['items']==[]
    assert doctor.patch('/api/records/'+r['id'],json={'version':1,'status':'dispensed'}).status_code==403
    assert pharmacy.patch('/api/records/'+r['id'],json={'version':1,'status':'dispensed'}).status_code==200
    assert pharmacy.patch('/api/records/'+r['id'],json={'version':1,'status':'dispensed'}).status_code==409


def test_laboratory_result_workflow(setup):
    client,_=setup;doctor=client();p=new_patient(doctor)
    r=doctor.post('/api/records',json={'patient_id':p['id'],'kind':'lab','data':{'title':'Fictitious analysis'}}).json()
    tech=client('lab_tech')
    assert tech.patch('/api/records/'+r['id'],json={'version':1,'status':'completed'}).status_code==422
    assert tech.patch('/api/records/'+r['id'],json={'version':1,'status':'completed','result':'Fictitious result'}).status_code==200
    assert doctor.get('/api/records').json()['items'][0]['data']['result']=='Fictitious result'


def test_transfer_consent_destination_and_minimization(setup):
    client,_=setup;a=client();b=client(facility='b');p=new_patient(a,phone='private')
    body={'patient_id':p['id'],'destination_id':'b','summary':'Fictitious clinical summary','consent_note':'Consent confirmed for this referral only.'}
    assert a.post('/api/transfers',json=body).status_code==422
    assert a.post('/api/transfers',json={**body,'consent':False}).status_code==422
    t=a.post('/api/transfers',json={**body,'consent':True}).json()
    received=b.get('/api/transfers').json()['items'][0]
    assert 'phone' not in received['patient_snapshot']
    assert b.get('/api/patients/'+p['id']).status_code==404
    assert a.patch('/api/transfers/'+t['id'],json={'version':1,'status':'accepted'}).status_code==403
    assert b.patch('/api/transfers/'+t['id'],json={'version':1,'status':'accepted'}).status_code==200
    assert b.patch('/api/transfers/'+t['id'],json={'version':1,'status':'declined'}).status_code==409
    assert b.get('/api/patients/'+p['id']).status_code==404
    assert client('admin').get('/api/transfers').status_code==403


def test_audit_is_scoped_and_has_no_clinical_values(setup):
    client,_=setup;doctor=client();p=new_patient(doctor,first_name='PrivateName')
    doctor.get('/api/patients/'+p['id'])
    assert doctor.get('/api/audit').status_code==403
    log=client('admin').get('/api/audit')
    assert 'patient.create' in log.text and 'patient.read' in log.text
    assert 'PrivateName' not in log.text
    other=client('admin','b').get('/api/audit').json()['items']
    assert not any(a['resource_id']==p['id'] for a in other)


def test_login_rate_limit_and_cache_headers(setup):
    c=TestClient(app,headers=HEADERS)
    for _ in range(8):
        assert c.post('/api/auth/login',json={'email':'unknown@test.test','password':'wrong'}).status_code==401
    assert c.post('/api/auth/login',json={'email':'unknown@test.test','password':'wrong'}).status_code==429
    assert c.get('/api/health').headers['cache-control']=='no-store'


def test_password_hash_is_salted():
    a=hash_password(PASSWORD);b=hash_password(PASSWORD)
    assert a!=b and verify_password(PASSWORD,a) and not verify_password('wrong',a)


def test_appointment_requires_future_timezone_and_notes_cannot_be_rewritten(setup):
    client,_=setup;c=client();p=new_patient(c)
    for when in ['2020-01-01T12:00:00Z','2099-01-01T12:00:00']:
        assert c.post('/api/records',json={'kind':'appointment','patient_id':p['id'],'data':{'title':'Visit','service':'General','scheduled_at':when}}).status_code==422
    r=c.post('/api/records',json={'kind':'note','patient_id':p['id'],'data':{'title':'Visit note','notes':'Fictitious note'}}).json()
    assert c.patch('/api/records/'+r['id'],json={'version':1,'status':'cancelled'}).status_code==403


def test_large_queues_are_accessible_and_totals_are_scoped(setup):
    client,factory=setup
    c=client();p=new_patient(c)
    with factory() as db:
        doctor=db.scalar(select(User).where(User.email=='doctor@a.test'))
        db.add_all([Record(patient_id=p['id'], facility_id='a', kind='lab', data={'title':f'Analysis {i}'},author_id=doctor.id) for i in range(105)])
        db.commit()
    first=c.get('/api/records?kind=lab&limit=50').json()
    last=c.get('/api/records?kind=lab&offset=100&limit=50').json()
    assert first['total']==105 and len(first['items'])==50 and len(last['items'])==5
    assert set(r['id'] for r in first['items']).isdisjoint(r['id'] for r in last['items'])
    assert last['items'][0]['patient_name']=='Awa Exemple'
    assert c.get('/api/dashboard').json()['pending']['lab']==105
    assert client('pharmacist').get('/api/dashboard').json()['pending']=={'prescription':0}
    assert client(facility='b').get('/api/dashboard').json()['pending']['lab']==0
    assert c.get('/api/records?kind=lab&status=completed').json()['total']==0


def test_expired_or_foreign_records_cannot_be_mutated(setup):
    client,_=setup;a=client();b=client(facility='b');p=new_patient(a)
    r=a.post('/api/records',json={'patient_id':p['id'],'kind':'lab','data':{'title':'Analysis'}}).json()
    assert b.patch('/api/records/'+r['id'],json={'version':1,'status':'cancelled'}).status_code==404
    assert b.put('/api/patients/'+p['id'],json={'first_name':'X','last_name':'Y','version':1}).status_code==404
    assert a.post('/api/transfers',json={'patient_id':p['id'],'destination_id':'a','summary':'Transfer summary','consent':True,'consent_note':'Recorded consent'}).status_code==422
    for origin in ['https://attacker.test', 'null']:
        assert a.post('/api/patients',headers={'Origin':origin},json={'first_name':'X','last_name':'Y'}).status_code==403


def test_session_remaining_time_and_sensitive_headers(setup):
    client,factory=setup;c=client()
    import time
    with factory() as db:
        session=db.scalar(select(Session));session.expires=int(time.time())+60;db.commit()
    assert 0 < c.get('/api/auth/me').json()['session_seconds'] <= 60
    assert c.get('/api/patients').headers['cache-control']=='no-store'


def test_password_whitespace_is_preserved(setup):
    _,factory=setup
    password='  leading and trailing spaces  '
    with factory() as db:
        account=db.scalar(select(User).where(User.email=='doctor@a.test'))
        account.password=hash_password(password);db.commit()
    c=TestClient(app,headers=HEADERS)
    assert c.post('/api/auth/login',json={'email':' DOCTOR@A.TEST ','password':password}).status_code==200
    assert c.post('/api/auth/login',json={'email':'doctor@a.test','password':password.strip()}).status_code==401


def test_validation_errors_do_not_echo_passwords_or_patient_information(setup):
    client,_=setup
    c=TestClient(app,headers=HEADERS)
    secret='PRIVATE-PASSWORD-' * 20
    response=c.post('/api/auth/login',json={'email':'doctor@a.test','password':secret})
    assert response.status_code==422
    assert 'PRIVATE-PASSWORD' not in response.text
    response=client().post('/api/patients',json={'first_name':'PRIVATE-PATIENT', 'last_name':'Example','date_of_birth':'PRIVATE-BAD-DATE'})
    assert response.status_code==422
    assert 'PRIVATE' not in response.text
    assert response.headers['cache-control']=='no-store'


def test_session_extend_and_login_retry_after(setup):
    client,factory=setup
    c=client()
    with factory() as db:
        stored=db.scalar(select(Session));stored.expires=int(__import__('time').time())+60;db.commit()
    r=c.post('/api/auth/extend')
    assert r.status_code==200 and r.json()['session_seconds']==1800
    with factory() as db:
        assert db.scalar(select(Session)).expires>int(__import__('time').time())+1700
    anon=TestClient(app,headers=HEADERS)
    assert anon.post('/api/auth/extend').status_code==401
    for _ in range(8):
        anon.post('/api/auth/login',json={'email':'nurse@a.test','password':'wrong'})
    r=anon.post('/api/auth/login',json={'email':'nurse@a.test','password':'wrong'})
    assert r.status_code==429 and r.headers.get('Retry-After')=='900'
