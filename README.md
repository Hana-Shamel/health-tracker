# Health tracker

A personal record of meals, medicines, measurements, activity, and doctor visits. It runs on your machine and stores its data in `data/health.db`.

## Run

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000

The log page is a writing bar at the bottom of the screen. Medicine is a weekly pill box for what you currently take. Doctor visits keeps the note from each appointment.
