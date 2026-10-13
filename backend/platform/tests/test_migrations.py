import os
import subprocess
import sys
from pathlib import Path
from sqlalchemy import create_engine, inspect, text

ROOT = Path(__file__).resolve().parents[1]

def test_upgrade_is_repeatable_and_preserves_data(tmp_path):
    url = f"sqlite:///{tmp_path}/migration.db"
    env = {**os.environ, "DATABASE_URL": url}
    subprocess.run([sys.executable, "-m", "app.manage", "init-db"], cwd=ROOT, env=env, check=True)
    engine = create_engine(url)
    with engine.begin() as db:
        db.execute(text("INSERT INTO facilities (id,name,city) VALUES ('test','Test','Test')"))
    subprocess.run([sys.executable, "-m", "app.manage", "init-db"], cwd=ROOT, env=env, check=True)
    assert {"users", "patients", "records", "transfers", "audit", "alembic_version"} <= set(inspect(engine).get_table_names())
    with engine.connect() as db:
        assert db.scalar(text("SELECT name FROM facilities WHERE id='test'")) == "Test"
    subprocess.run([sys.executable, "-m", "alembic", "check"], cwd=ROOT, env=env, check=True)
    engine.dispose()
