# Australian Speeding Dashboard — Local run instructions

This project is a static HTML/CSS/JS prototype. To run it locally so `fetch()` can load the CSV and TopoJSON, serve the project over HTTP.

Options:

- Start with Python (simplest):

```powershell
# from project root (Windows PowerShell)
python -m http.server 8000

# then open in browser:
start http://localhost:8000
```

- Use the included helper script (`serve.ps1`) to launch a new PowerShell window for the server and open the browser:

```powershell
.\serve.ps1
```

Notes:
- Place your CSV at `data/Cleaned Dataset DV Fines.csv`.
- Place a TopoJSON for Australia at `data/australia.topojson` to render the map.
- If your CSV headers differ from the expected names (`year`, `state`, `fines_count`, `licences_count`, `detection_method`, `age_group`, `location_type`, `avg_speed`, `hour`) paste the first 20 rows and I'll update the parsing.
