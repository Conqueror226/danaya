"""Explicit database and account administration; never runs at API startup."""
import argparse
import getpass
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import delete, select
from .db import Audit, Base, Facility, Patient, Session, SessionLocal, User, engine
from .security import ROLES, hash_password


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init-db")
    facility = sub.add_parser("add-facility")
    facility.add_argument("id")
    facility.add_argument("name")
    facility.add_argument("city")
    user = sub.add_parser("add-user")
    user.add_argument("email")
    user.add_argument("name")
    user.add_argument("role", choices=sorted(ROLES))
    user.add_argument("facility_id")
    disable = sub.add_parser("disable-user")
    disable.add_argument("email")
    reset = sub.add_parser("reset-password")
    reset.add_argument("email")
    demo = sub.add_parser("seed-demo")
    demo.add_argument("--confirm-fictional", action="store_true", required=True)
    args = parser.parse_args()
    if args.command == "init-db":
        command.upgrade(Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), "head")
        print("Database migrations applied.")
        return
    with SessionLocal() as db:
        if args.command == "add-facility":
            db.add(Facility(id=args.id, name=args.name, city=args.city))
        elif args.command == "add-user":
            if not db.get(Facility, args.facility_id):
                parser.error("Register the facility first.")
            password = getpass.getpass("Password (at least 14 characters): ")
            if not 14 <= len(password) <= 256 or password != getpass.getpass("Confirm password: "):
                parser.error("Password too short or confirmation does not match.")
            if len(args.email) > 254 or "@" not in args.email or len(args.name) > 150:
                parser.error("Invalid email or name.")
            if db.scalar(select(User).where(User.email == args.email.strip().lower())):
                parser.error("Account already exists; use reset-password if necessary.")
            db.add(User(email=args.email.strip().lower(), name=args.name, role=args.role,
                        facility_id=args.facility_id, password=hash_password(password)))
        elif args.command in {"disable-user", "reset-password"}:
            account = db.scalar(select(User).where(User.email == args.email.strip().lower()))
            if not account:
                parser.error("Account not found.")
            if args.command == "disable-user":
                account.active = False
            else:
                password = getpass.getpass("New password (14–256 characters): ")
                if not 14 <= len(password) <= 256 or password != getpass.getpass("Confirm password: "):
                    parser.error("Invalid password or confirmation.")
                account.password = hash_password(password)
            db.execute(delete(Session).where(Session.user_id == account.id))
            db.add(Audit(user_id="operator-cli", facility_id=account.facility_id,
                         action="account." + args.command, resource_id=account.id))
        elif args.command == "seed-demo":
            if db.scalar(select(Facility.id).limit(1)):
                parser.error("Demo seeding is allowed only into an empty database.")
            password = getpass.getpass("Choose a demo password (at least 14 characters): ")
            if not 14 <= len(password) <= 256:
                parser.error("Password too short.")
            db.add_all([Facility(id="demo-ouaga", name="Centre Démo Ouagadougou", city="Ouagadougou"),
                        Facility(id="demo-bobo", name="Centre Démo Bobo", city="Bobo-Dioulasso")])
            db.flush()
            for role in sorted(ROLES):
                db.add(User(email=f"{role}@demo.danaya", name=f"Compte démo {role}", role=role,
                            facility_id="demo-ouaga", password=hash_password(password)))
            db.add(User(email="receiving@demo.danaya", name="Médecin destinataire démo", role="doctor",
                        facility_id="demo-bobo", password=hash_password(password)))
            for first, last in [("Awa", "Exemple"), ("Idrissa", "Fictif"), ("Mariam", "Test")]:
                db.add(Patient(facility_id="demo-ouaga", first_name=first, last_name=last, sex="U"))
        db.commit()
        print("Done.")


if __name__ == "__main__":
    main()
