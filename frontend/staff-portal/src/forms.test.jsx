import React from 'react';
import {test, expect, vi, afterEach} from 'vitest';
import {render, screen, cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {RecordForm} from './forms';
import {api} from './api';
vi.mock('./api', () => ({api: vi.fn()}));
afterEach(cleanup);

test('patient picker reaches a later page without submitting the clinical form', async () => {
  const first = Array.from({length:50}, (_,i) => ({id:`p-${i}`,first_name:'Example',last_name:`Patient ${i}`}));
  const last = {id:'p-50',first_name:'Later',last_name:'Patient',date_of_birth:'1990-01-01'};
  api.mockImplementation(async path => ({items:path.includes('offset=50') ? [last] : first,total:51}));
  const save=vi.fn(), close=vi.fn(), user=userEvent.setup();
  render(<RecordForm kind="note" patients={first} onSave={save} onClose={close}/>);
  await user.click(await screen.findByRole('button',{name:'Suivant'}));
  await screen.findByRole('option',{name:/Later Patient/});
  expect(save).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText('Patient'),'p-50');
  await user.type(screen.getByLabelText('Intitulé'),'Observation test');
  await user.type(screen.getByLabelText('Observation clinique'),'Fictional observation');
  await user.click(screen.getByRole('button',{name:'Enregistrer'}));
  expect(save).toHaveBeenCalledWith({patient_id:'p-50',kind:'note',data:{title:'Observation test',notes:'Fictional observation'}});
  expect(close).toHaveBeenCalledOnce();
});
