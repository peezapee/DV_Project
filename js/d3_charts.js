// d3_charts.js - loads CSV and topojson and renders choropleth, line chart, stacked bar, age bar

(async function(){
  const csvPath = 'data/Cleaned Dataset DV Fines.csv';
  const topoPath = 'data/australia.topojson';

  // detect which page we're on so we only render required charts
  const page = document.body && (document.body.dataset.page || document.body.id) ? (document.body.dataset.page || document.body.id) : 'dashboard';

  // Utility: robust CSV parsing using d3.csvParse if needed
  async function loadCSV(){
    try{
      const raw = await fetch(csvPath);
      if(!raw.ok) throw new Error('CSV not found');
      const text = await raw.text();
      const data = d3.csvParse(text);
      console.info('CSV loaded. Columns:', data.columns);
      return data;
    }catch(err){
      console.error(err);
      const mapEl = document.getElementById('map'); if(mapEl) mapEl.textContent = 'CSV not found. Place your CSV at ' + csvPath;
      return null;
    }
  }

  async function loadTopo(){
    try{
      const r = await fetch(topoPath);
      if(!r.ok) throw new Error('TopoJSON not found');
      const topo = await r.json();
      return topo;
    }catch(err){
      console.warn('TopoJSON not found. Map will not render:', err.message);
      const mapEl = document.getElementById('map'); if(mapEl) mapEl.textContent = 'TopoJSON not found. Place a TopoJSON at ' + topoPath;
      return null;
    }
  }

  const data = await loadCSV();
  const topo = await loadTopo();
  if(!data) return;

  // Expected columns in your CSV (if different, update mapping here)
  // year, state, fines_count, licences_count, detection_method, age_group, location_type, avg_speed, hour

  // Map CSV columns to internal fields and coerce types.
  // CSV has headers like: YEAR, JURISDICTION, LOCATION, AGE_GROUP, METRIC, DETECTION_METHOD, FINES, DETECTION_GROUP
  data.forEach(d => {
    // keep original keys but also create normalized keys used by the charts
    d.year = d['YEAR'] ? +d['YEAR'] : (d.year? +d.year : NaN);
    d.state = d['JURISDICTION'] || d['state'] || 'Unknown';
    d.location = d['LOCATION'] || d['location'] || 'Unknown';
    d.age_group = d['AGE_GROUP'] || d['age_group'] || 'Unknown';
    d.detection_method = d['DETECTION_METHOD'] || d['DETECTION_GROUP'] || d['detection_method'] || 'Unknown';
    // normalize detection method to two canonical categories used across the site
    const dm = (d.detection_method || '').toString().toLowerCase();
    if(dm.includes('camera') || dm.includes('cam') || dm.includes('mobile') || dm.includes('fixed')){
      d.detection_method = 'Fixed or mobile camera';
    } else if(dm.includes('officer') || dm.includes('police') || dm.includes('offence') || dm.includes('issued')){
      // map officer-issued / police variants to 'Police issued'
      d.detection_method = 'Police issued';
    } else {
      // anything else will be grouped as 'Other' (not exposed in the detection selector)
      d.detection_method = 'Other';
    }
    d.metric = d['METRIC'] || d.metric || '';
    d.fines_count = d['FINES'] ? +d['FINES'] : (d.fines_count? +d.fines_count : 0);
    d.arrests = d['ARRESTS'] ? +d['ARRESTS'] : (d.arrests? +d.arrests : 0);
    d.charges = d['CHARGES'] ? +d['CHARGES'] : (d.charges? +d.charges : 0);
  });

  // Default filters
  let activeState = 'all';
  const yearEl = document.getElementById('yearRange');
  let activeYear = yearEl ? +yearEl.value : null;
  let activeDetections = [];
  let activeLoc = 'All';

  // Populate UI selects (years, detection methods, locations) from CSV
  (function populateControls(){
    // Years
    const years = Array.from(new Set(data.map(d=> d.year))).filter(Boolean).sort((a,b)=>a-b);
    if(years.length){
      const minY = years[0], maxY = years[years.length-1];
      const yrInput = document.getElementById('yearRange');
      if(yrInput){
        yrInput.min = minY; yrInput.max = maxY; yrInput.value = Math.min(Math.max(activeYear || minY, minY), maxY);
        const yrSpan = document.getElementById('yr'); if(yrSpan) yrSpan.textContent = yrInput.value;
        activeYear = +yrInput.value;
      } else {
        // no range control on this page; pick latest year by default
        activeYear = maxY;
      }
    }

    // Detection methods (restrict to two canonical options)
    const allowedDetections = ['Fixed or mobile camera', 'Police issued'];
    const detectionSelect = document.getElementById('detection');
    if(detectionSelect){
      detectionSelect.innerHTML = '';
      // only expose the two allowed options (keeps UI focused)
      allowedDetections.forEach(m=>{
        const opt = document.createElement('option'); opt.value = m; opt.text = m; detectionSelect.appendChild(opt);
      });
    }

    // Locations (populate locType select) — include a top 'All' option
    const locSet = Array.from(new Set(data.map(d=> d.location).filter(Boolean))).sort();
    const locSelect = document.getElementById('locType');
    if(locSelect){
      locSelect.innerHTML = '';
      const allOpt = document.createElement('option'); allOpt.value = 'All'; allOpt.text = 'All'; locSelect.appendChild(allOpt);
      locSet.forEach(l=>{ const opt = document.createElement('option'); opt.value = l; opt.text = l; locSelect.appendChild(opt); });
    }

    // Jurisdiction select: ensure values include CSV jurisdictions (preserve 'All' first)
    const jurisSet = Array.from(new Set(data.map(d=> d.state).filter(Boolean)));
    const jurisSelect = document.getElementById('jurisdiction');
    if(jurisSelect){
      // keep existing 'all' option, then add any missing jurisdictions
      const existing = Array.from(jurisSelect.options).map(o=> o.value || o.text);
      jurisSet.forEach(j=>{
        if(!existing.includes(j)){
          const opt = document.createElement('option'); opt.text = j; opt.value = j; jurisSelect.appendChild(opt);
        }
      });
    }
  })();

  // filter helpers
  function getFiltered(){
    return data.filter(d=> (activeState==='all' || d.state===activeState) &&
                           (!activeYear || d.year==activeYear) &&
                           (activeDetections.length===0 || activeDetections.includes(d.detection_method)) &&
                           (activeLoc==='All' || d.location===activeLoc)
                         );
  }

  // KPIs
  function updateKPIs(filtered){
    const totalFines = d3.sum(filtered, d=> d.fines_count || 0);
    // YoY change: compare total fines for activeYear vs previous year (same filters except year)
    const prevYear = activeYear ? (activeYear - 1) : null;
    let yoyText = '—';
    if(prevYear){
      const filteredPrev = data.filter(d=> (activeState==='all' || d.state===activeState) && d.year===prevYear && (activeDetections.length===0 || activeDetections.includes(d.detection_method)) && (activeLoc==='All' || d.location===activeLoc));
      const prevFines = d3.sum(filteredPrev, d=> d.fines_count || 0);
      if(prevFines>0){
        const pct = ((totalFines - prevFines) / prevFines) * 100;
        yoyText = (pct>=0? '+':'') + pct.toFixed(1) + '%';
      } else if(totalFines>0){
        yoyText = 'N/A';
      }
    }

    // police vs camera fines: detect methods with 'camera' in name as camera, rest as police/other
    const cameraKeywords = ['camera','cam'];
    const policeFines = d3.sum(filtered.filter(d=> !cameraKeywords.some(k=> (d.detection_method||'').toLowerCase().includes(k))), d=> d.fines_count||0);
    const cameraFines = d3.sum(filtered.filter(d=> cameraKeywords.some(k=> (d.detection_method||'').toLowerCase().includes(k))), d=> d.fines_count||0);

    const arrests = d3.sum(filtered, d=> d.arrests || 0);
    const charges = d3.sum(filtered, d=> d.charges || 0);

    const kTotal = document.getElementById('k_total'); if(kTotal) kTotal.textContent = totalFines.toLocaleString();
    const yearDisplay = document.getElementById('k_year_display'); if(yearDisplay) yearDisplay.textContent = activeYear || '';
    const kPolice = document.getElementById('k_police'); if(kPolice) kPolice.textContent = policeFines.toLocaleString();
    const kCamera = document.getElementById('k_camera'); if(kCamera) kCamera.textContent = cameraFines.toLocaleString();
    const kArrests = document.getElementById('k_arrests'); if(kArrests) kArrests.textContent = arrests.toLocaleString();
    const kCharges = document.getElementById('k_charges'); if(kCharges) kCharges.textContent = charges.toLocaleString();
    const per10kEl = document.getElementById('k_per10k'); if(per10kEl) per10kEl.textContent = '—';
    const yoyEl = document.getElementById('k_yoy'); if(yoyEl) yoyEl.textContent = yoyText;
  }

  // Choropleth
  function renderMap(topo){
    if(!topo) return;
    const geo = topojson.feature(topo, topo.objects.collection || topo.objects.states || Object.values(topo.objects)[0]);
    const width = document.getElementById('map').clientWidth;
    const height = 320;
    d3.select('#map').selectAll('*').remove();
    const svg = d3.select('#map').append('svg').attr('class','chart').attr('viewBox',`0 0 ${width} ${height}`);
    const projection = d3.geoMercator().fitSize([width,height], geo);
    const path = d3.geoPath().projection(projection);

    // compute per-state fines per 10k licences (for activeYear)
    const year = activeYear;
    const byState = d3.rollup(data.filter(d=>d.year===year), v=>({fines: d3.sum(v,d=>d.fines_count||0)}), d=>d.state);
    const values = Array.from(byState.values()).map(v=> v.fines || 0);
    const maxVal = d3.max(values) || 1;
    const color = d3.scaleSequential().domain([0, maxVal]).interpolator(d3.interpolateYlOrRd).clamp(true);

    // Populate map legend (gradient + min/max)
    try{
      const gradEl = document.getElementById('mapGradient');
      if(gradEl){
        // create a simple CSS gradient from interpolated colors
        const stops = [0,0.25,0.5,0.75,1].map(t=> d3.rgb(d3.interpolateYlOrRd(t)).formatHex());
        gradEl.style.background = `linear-gradient(90deg, ${stops.join(',')})`;
      }
      const minEl = document.getElementById('mapMin'); if(minEl) minEl.textContent = '0';
      const maxEl = document.getElementById('mapMax'); if(maxEl) maxEl.textContent = (Math.round(maxVal)).toLocaleString();
    }catch(e){ /* ignore legend errors */ }

    svg.append('g').selectAll('path').data(geo.features).enter().append('path')
      .attr('d', path)
      .attr('fill', d => {
        const name = d.properties && (d.properties.STATE_NAME || d.properties.name || d.properties.NAME);
        const val = byState.get(name);
        return val? color(val.fines || 0) : '#f3f4f6';
      })
      .attr('stroke', '#fff')
      .on('mouseover', function(event,d){
        const name = d.properties && (d.properties.STATE_NAME || d.properties.name || d.properties.NAME);
        const val = byState.get(name);
        const fines = val? val.fines : 0;
        const tip = d3.select('body').append('div').attr('class','tooltip').html(`<strong>${name}</strong><br/><span>Fines: </span><strong>${fines.toLocaleString()}</strong>`);
        tip.style('left', (event.pageX+10) + 'px').style('top', (event.pageY+10) + 'px');
      })
      .on('mouseout', ()=> d3.selectAll('.tooltip').remove())
      .on('click', function(event,d){
        const name = d.properties && (d.properties.STATE_NAME || d.properties.name || d.properties.NAME);
        activeState = name;
        document.getElementById('jurisdiction').value = name;
        updateAll();
      });
  }

  // Line chart: annual total fines (click a point to set year filter)
  function renderLine(filtered){
    const container = d3.select('#lineChart'); container.selectAll('*').remove();
    const margin = {top:12,right:16,bottom:30,left:48};
    const w = container.node().clientWidth; const h = 220;
    const svg = container.append('svg').attr('class','chart').attr('viewBox',`0 0 ${w} ${h}`);
    const g = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
    const innerW = w - margin.left - margin.right; const innerH = h - margin.top - margin.bottom;

    // Build series by year using the full dataset but applying current state/detection/location filters (ignore activeYear)
    const baseFiltered = data.filter(d=> (activeState==='all' || d.state===activeState) && (activeDetections.length===0 || activeDetections.includes(d.detection_method)) && (activeLoc==='All' || d.location===activeLoc));
    const byYear = Array.from(d3.rollup(baseFiltered, v=> d3.sum(v, d=> d.fines_count||0), d=> d.year)).map(([year, fines])=> ({year: +year, fines})).sort((a,b)=> a.year - b.year);
    if(byYear.length===0){ g.append('text').text('No data').attr('x',10).attr('y',20); return; }

    const x = d3.scaleLinear().domain(d3.extent(byYear, d=> d.year)).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, d3.max(byYear, d=> d.fines) || 1]).range([innerH,0]).nice();

    // gridlines
    g.append('g').attr('class','grid').selectAll('line').data(y.ticks(4)).enter().append('line').attr('x1',0).attr('x2',innerW).attr('y1',d=> y(d)).attr('y2',d=> y(d)).attr('stroke','#e6eef8').attr('stroke-width',1);

    const line = d3.line().x(d=> x(d.year)).y(d=> y(d.fines)).curve(d3.curveMonotoneX);
    g.append('path').datum(byYear).attr('fill','none').attr('stroke','#0b3d91').attr('stroke-width',3).attr('d', line).attr('opacity',0.95);

    // points
    g.selectAll('circle').data(byYear).enter().append('circle').attr('cx',d=> x(d.year)).attr('cy',d=> y(d.fines)).attr('r',4).attr('fill','#ffffff').attr('stroke','#0b3d91').attr('stroke-width',2)
      .on('mouseover', (event,d)=>{ d3.selectAll('.tooltip').remove(); const tip = d3.select('body').append('div').attr('class','tooltip').html(`<strong>${d.year}</strong><br/>Fines: ${d.fines.toLocaleString()}`); tip.style('left', (event.pageX+10) + 'px').style('top', (event.pageY+10) + 'px'); })
      .on('mouseout', ()=> d3.selectAll('.tooltip').remove())
      .on('click', (event,d)=>{ document.getElementById('yearRange').value = d.year; document.getElementById('yr').textContent = d.year; activeYear = d.year; updateAll(); });

    // axes
    const xAxis = d3.axisBottom(x).ticks(byYear.length).tickFormat(d3.format('d'));
    const yAxis = d3.axisLeft(y).ticks(4).tickFormat(d3.format(','));
    g.append('g').attr('transform',`translate(0,${innerH})`).attr('class','axis').call(xAxis);
    g.append('g').attr('class','axis').call(yAxis);

    svg.append('text').attr('class','axis-label').attr('x', (w/2)).attr('y', h - 6).attr('text-anchor','middle').text('Year');
  }

  // Stacked bar for detection methods (per year or for selected state)
  function renderStacked(filtered){
    const container = d3.select('#stacked'); container.selectAll('*').remove();
    const margin = {top:10,right:10,bottom:30,left:40};
    const w = container.node().clientWidth; const h=160;
    const svg = container.append('svg').attr('class','chart').attr('viewBox',`0 0 ${w} ${h}`);
    const g = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
    const innerW = w - margin.left - margin.right; const innerH = h - margin.top - margin.bottom;

    const methods = Array.from(new Set(filtered.map(d=> d.detection_method))).filter(Boolean);
    if(methods.length===0){ g.append('text').text('No data').attr('x',10).attr('y',20); return; }

    const byYearMethod = d3.rollups(filtered, v=> d3.sum(v,d=>d.fines_count||0), d=>d.year, d=>d.detection_method);
    const years = Array.from(new Set(filtered.map(d=>d.year))).sort((a,b)=>a-b);
    const dataStack = years.map(y=>{
      const row = {year:y};
      methods.forEach(m=> row[m] = 0);
      const entry = byYearMethod.find(e=> e[0]===y);
      if(entry){ entry[1].forEach(([m,val])=> row[m]=val); }
      return row;
    });

    const stack = d3.stack().keys(methods)(dataStack);
    const x = d3.scaleBand().domain(years.map(String)).range([0,innerW]).padding(0.12);
    const y = d3.scaleLinear().domain([0, d3.max(dataStack,d=> d3.sum(methods,m=> d[m]))]).nice().range([innerH,0]);
    const color = d3.scaleOrdinal().domain(methods).range(d3.schemeSet2);

    // Populate stacked legend
    try{
      const legend = document.getElementById('stackLegend');
      if(legend){
        legend.innerHTML = '';
        methods.forEach(m=>{
          const item = document.createElement('div'); item.className = 'item';
          const sw = document.createElement('div'); sw.className = 'swatch'; sw.style.background = color(m);
          const lbl = document.createElement('div'); lbl.textContent = m; lbl.style.fontSize = '13px'; lbl.style.color = '#111827';
          item.appendChild(sw); item.appendChild(lbl); legend.appendChild(item);
        });
      }
    }catch(e){ /* ignore */ }

    g.append('g').selectAll('g').data(stack).enter().append('g').attr('fill',d=> color(d.key)).selectAll('rect').data(d=>d).enter().append('rect')
      .attr('x',d=> x(String(d.data.year))).attr('y',d=> y(d[1])).attr('height',d=> y(d[0]) - y(d[1])).attr('width', x.bandwidth())
      .on('mouseover', (event,d)=>{ const year = d.data.year; d3.selectAll('.tooltip').remove(); const tip = d3.select('body').append('div').attr('class','tooltip').html(`Year: ${year}<br/>Count: ${(d[1]-d[0]).toLocaleString()}`); tip.style('left', (event.pageX+10) + 'px').style('top', (event.pageY+10) + 'px'); })
      .on('mouseout', ()=> d3.selectAll('.tooltip').remove());

    // axes
    g.append('g').attr('transform',`translate(0,${innerH})`).attr('class','axis').call(d3.axisBottom(x).tickValues(years.filter((y,i)=> i%3===0).map(String)));
    g.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(',')));

    // labels
    svg.append('text').attr('class','axis-label').attr('x', (w/2)).attr('y', h - 4).attr('text-anchor','middle').text('Year');
    svg.append('text').attr('class','axis-label').attr('transform', `translate(12,${h/2}) rotate(-90)`).attr('text-anchor','middle').text('Fines (count)');
  }

  // Age distribution bar
  function renderAge(filtered){
    const container = d3.select('#ageBar'); container.selectAll('*').remove();
    const margin = {top:10,right:10,bottom:30,left:50};
    const w = container.node().clientWidth; const h=160;
    const svg = container.append('svg').attr('class','chart').attr('viewBox',`0 0 ${w} ${h}`);
    const g = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
    const innerW = w - margin.left - margin.right; const innerH = h - margin.top - margin.bottom;

    const byAge = d3.rollup(filtered, v=> d3.sum(v,d=> d.fines_count||0), d=> d.age_group);
    const ages = Array.from(byAge.keys()).sort();
    if(ages.length===0){ g.append('text').text('No data').attr('x',10).attr('y',20); return; }
    const dataA = ages.map(a=> ({age:a, fines: byAge.get(a)}));
    const x = d3.scaleBand().domain(ages).range([0,innerW]).padding(0.1);
    const y = d3.scaleLinear().domain([0, d3.max(dataA,d=>d.fines)]).nice().range([innerH,0]);

    g.selectAll('rect').data(dataA).enter().append('rect').attr('x',d=> x(d.age)).attr('y',d=> y(d.fines)).attr('height',d=> innerH-y(d.fines)).attr('width', x.bandwidth()).attr('fill','#6b7280')
      .on('mouseover',(event,d)=>{ d3.selectAll('.tooltip').remove(); const tip = d3.select('body').append('div').attr('class','tooltip').html(`${d.age}<br/>Fines: ${d.fines.toLocaleString()}`); tip.style('left', (event.pageX+10) + 'px').style('top', (event.pageY+10) + 'px'); })
      .on('mouseout', ()=> d3.selectAll('.tooltip').remove());

    g.append('g').attr('transform',`translate(0,${innerH})`).attr('class','axis').call(d3.axisBottom(x));
    g.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(',')));

    svg.append('text').attr('class','axis-label').attr('x', (w/2)).attr('y', h - 4).attr('text-anchor','middle').text('Age group');
    svg.append('text').attr('class','axis-label').attr('transform', `translate(14,${h/2}) rotate(-90)`).attr('text-anchor','middle').text('Fines');
  }

  // Top regions (by state) bar chart
  function renderTopRegions(filtered){
    const container = d3.select('#topRegions'); container.selectAll('*').remove();
    const margin = {top:10,right:10,bottom:40,left:70};
    const w = container.node() ? container.node().clientWidth : 600; const h = 360;
    const svg = container.append('svg').attr('class','chart').attr('viewBox',`0 0 ${w} ${h}`);
    const g = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
    const innerW = w - margin.left - margin.right; const innerH = h - margin.top - margin.bottom;

    const byState = d3.rollups(filtered, v=> d3.sum(v,d=> d.fines_count||0), d=> d.state).map(([k,v])=> ({state:k, fines:v}));
    if(byState.length===0){ g.append('text').text('No data').attr('x',10).attr('y',20); return; }
    const sorted = byState.sort((a,b)=> b.fines - a.fines).slice(0,10);
    const y = d3.scaleBand().domain(sorted.map(d=> d.state)).range([0, innerH]).padding(0.12);
    const x = d3.scaleLinear().domain([0, d3.max(sorted,d=> d.fines)]).range([0, innerW]).nice();

    g.selectAll('rect').data(sorted).enter().append('rect').attr('y',d=> y(d.state)).attr('height', y.bandwidth()).attr('x',0).attr('width',d=> x(d.fines)).attr('fill','#0b3d91')
      .on('mouseover',(event,d)=>{ d3.selectAll('.tooltip').remove(); const tip = d3.select('body').append('div').attr('class','tooltip').html(`<strong>${d.state}</strong><br/>Fines: ${d.fines.toLocaleString()}`); tip.style('left', (event.pageX+10) + 'px').style('top', (event.pageY+10) + 'px'); })
      .on('mouseout', ()=> d3.selectAll('.tooltip').remove());

    g.append('g').attr('class','axis').call(d3.axisLeft(y));
    g.append('g').attr('class','axis').attr('transform',`translate(0,${innerH})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(',')));

    svg.append('text').attr('class','axis-label').attr('x', (w/2)).attr('y', h - 6).attr('text-anchor','middle').text('Fines');
  }

  // Jurisdiction totals bar (Q1 - comparison across states for selected year)
  function renderJurisdictionBars(filtered){
    const container = d3.select('#jurisdictionBars'); if(!container.node()) return;
    container.selectAll('*').remove();
    const margin = {top:10,right:10,bottom:50,left:70};
    const w = container.node().clientWidth; const h = 300;
    const svg = container.append('svg').attr('class','chart').attr('viewBox',`0 0 ${w} ${h}`);
    const g = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
    const innerW = w - margin.left - margin.right; const innerH = h - margin.top - margin.bottom;

    const year = activeYear;
    const byState = Array.from(d3.rollups(data.filter(d=> d.year===year), v=> d3.sum(v,d=> d.fines_count||0), d=> d.state)).map(([k,v])=> ({state:k, fines:v}));
    if(byState.length===0){ g.append('text').text('No data').attr('x',10).attr('y',20); return; }
    const x = d3.scaleBand().domain(byState.map(d=> d.state)).range([0, innerW]).padding(0.12);
    const y = d3.scaleLinear().domain([0, d3.max(byState,d=> d.fines)]).nice().range([innerH,0]);

    g.selectAll('rect').data(byState).enter().append('rect').attr('x',d=> x(d.state)).attr('y',d=> y(d.fines)).attr('width', x.bandwidth()).attr('height', d=> innerH - y(d.fines)).attr('fill','#0b3d91')
      .on('mouseover',(event,d)=>{ d3.selectAll('.tooltip').remove(); const tip = d3.select('body').append('div').attr('class','tooltip').html(`<strong>${d.state}</strong><br/>Fines: ${d.fines.toLocaleString()}`); tip.style('left', (event.pageX+10) + 'px').style('top', (event.pageY+10) + 'px'); })
      .on('mouseout', ()=> d3.selectAll('.tooltip').remove());

    g.append('g').attr('transform',`translate(0,${innerH})`).attr('class','axis').call(d3.axisBottom(x)).selectAll('text').attr('transform','rotate(-30)').style('text-anchor','end');
    g.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(',')));
    svg.append('text').attr('class','axis-label').attr('x', (w/2)).attr('y', h - 6).attr('text-anchor','middle').text('Jurisdiction');
  }

  // Q3: Grouped bar chart comparing Camera vs Police per jurisdiction (selected year)
  function renderDetectionGrouped(filtered){
    const container = d3.select('#detectionGrouped'); if(!container.node()) return;
    container.selectAll('*').remove();
    const margin = {top:10,right:10,bottom:60,left:70};
    const w = container.node().clientWidth; const h = 320;
    const svg = container.append('svg').attr('class','chart').attr('viewBox',`0 0 ${w} ${h}`);
    const g = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
    const innerW = w - margin.left - margin.right; const innerH = h - margin.top - margin.bottom;

    const year = activeYear;
    const cameraKeywords = ['camera','cam'];
    // compute per jurisdiction camera vs police
    const juris = Array.from(new Set(data.map(d=> d.state))).filter(Boolean);
    const rows = juris.map(j => {
      const subset = data.filter(d=> d.year===year && d.state===j);
      const camera = d3.sum(subset.filter(d=> cameraKeywords.some(k=> (d.detection_method||'').toLowerCase().includes(k))), d=> d.fines_count||0);
      const police = d3.sum(subset.filter(d=> !cameraKeywords.some(k=> (d.detection_method||'').toLowerCase().includes(k))), d=> d.fines_count||0);
      return {state:j, camera, police};
    }).filter(r=> r.camera||r.police);
    if(rows.length===0){ g.append('text').text('No data').attr('x',10).attr('y',20); return; }

    const groups = rows.map(d=> d.state);
    const x0 = d3.scaleBand().domain(groups).range([0, innerW]).padding(0.12);
    const x1 = d3.scaleBand().domain(['camera','police']).range([0, x0.bandwidth()]).padding(0.08);
    const y = d3.scaleLinear().domain([0, d3.max(rows, r=> Math.max(r.camera, r.police))]).nice().range([innerH,0]);
    const color = d3.scaleOrdinal().domain(['camera','police']).range(['#0b3d91','#d1495b']);

    const group = g.selectAll('.grouper').data(rows).enter().append('g').attr('transform', d=> `translate(${x0(d.state)},0)`);
    group.selectAll('rect').data(d=> ['camera','police'].map(k=> ({key:k, value: d[k]}))).enter().append('rect')
      .attr('x', d=> x1(d.key)).attr('y', d=> y(d.value)).attr('width', x1.bandwidth()).attr('height', d=> innerH - y(d.value)).attr('fill', d=> color(d.key))
      .on('mouseover',(event,d)=>{ d3.selectAll('.tooltip').remove(); const tip = d3.select('body').append('div').attr('class','tooltip').html(`${d.key}<br/>Fines: ${d.value.toLocaleString()}`); tip.style('left', (event.pageX+10) + 'px').style('top', (event.pageY+10) + 'px'); })
      .on('mouseout', ()=> d3.selectAll('.tooltip').remove());

    g.append('g').attr('transform',`translate(0,${innerH})`).call(d3.axisBottom(x0)).selectAll('text').attr('transform','rotate(-30)').style('text-anchor','end');
    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(',')));

    // legend
    const legend = svg.append('g').attr('transform', `translate(${w - 140},10)`);
    ['camera','police'].forEach((k,i)=>{
      const gL = legend.append('g').attr('transform', `translate(0,${i*20})`);
      gL.append('rect').attr('width',12).attr('height',12).attr('fill', color(k));
      gL.append('text').attr('x',18).attr('y',10).text(k.charAt(0).toUpperCase()+k.slice(1)).attr('font-size','12px').attr('fill','#111827');
    });
  }

  // Q4: Location type comparison (urban vs rural or other location types)
  function renderLocationBar(filtered){
    const container = d3.select('#locationBar'); if(!container.node()) return;
    container.selectAll('*').remove();
    const margin = {top:10,right:10,bottom:40,left:70};
    const w = container.node().clientWidth; const h = 300;
    const svg = container.append('svg').attr('class','chart').attr('viewBox',`0 0 ${w} ${h}`);
    const g = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
    const innerW = w - margin.left - margin.right; const innerH = h - margin.top - margin.bottom;

    const year = activeYear;
    const byLoc = Array.from(d3.rollups(data.filter(d=> d.year===year), v=> d3.sum(v,d=> d.fines_count||0), d=> d.location)).map(([k,v])=> ({loc:k, fines:v}));
    if(byLoc.length===0){ g.append('text').text('No data').attr('x',10).attr('y',20); return; }
    const x = d3.scaleBand().domain(byLoc.map(d=> d.loc)).range([0, innerW]).padding(0.12);
    const y = d3.scaleLinear().domain([0, d3.max(byLoc,d=> d.fines)]).nice().range([innerH,0]);

    g.selectAll('rect').data(byLoc).enter().append('rect').attr('x',d=> x(d.loc)).attr('y',d=> y(d.fines)).attr('width', x.bandwidth()).attr('height', d=> innerH - y(d.fines)).attr('fill','#0b3d91')
      .on('mouseover',(event,d)=>{ d3.selectAll('.tooltip').remove(); const tip = d3.select('body').append('div').attr('class','tooltip').html(`<strong>${d.loc}</strong><br/>Fines: ${d.fines.toLocaleString()}`); tip.style('left', (event.pageX+10) + 'px').style('top', (event.pageY+10) + 'px'); })
      .on('mouseout', ()=> d3.selectAll('.tooltip').remove());

    g.append('g').attr('transform',`translate(0,${innerH})`).attr('class','axis').call(d3.axisBottom(x)).selectAll('text').attr('transform','rotate(-30)').style('text-anchor','end');
    g.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(',')));
  }

  // Q5: Multi-line chart comparing camera vs police over time
  function renderCameraPoliceLines(filtered){
    const container = d3.select('#cameraPoliceChart'); if(!container.node()) return;
    container.selectAll('*').remove();
    // Slightly larger left margin so Y-axis labels aren't clipped; cap total height to make chart a bit smaller
    const margin = {top:8,right:20,bottom:28,left:72};
    const w = container.node().clientWidth || 700;
    // Use container height but keep it within a reasonable range so the chart is slightly smaller
    const containerH = container.node().clientHeight || 520;
    const h = Math.min(Math.max(240, containerH), 520);
    const svg = container.append('svg').attr('class','chart').attr('viewBox',`0 0 ${w} ${h}`).attr('preserveAspectRatio','xMidYMid meet');
    const g = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
    const innerW = w - margin.left - margin.right; const innerH = h - margin.top - margin.bottom;

    const cameraKeywords = ['camera','cam'];
    const baseFiltered = data.filter(d=> (activeState==='all' || d.state===activeState) && (activeLoc==='All' || d.location===activeLoc));
    const years = Array.from(new Set(baseFiltered.map(d=> d.year))).sort((a,b)=> a-b);
    const byYearGroup = years.map(y=>{
      const subset = baseFiltered.filter(d=> d.year===y);
      return {
        year: y,
        camera: d3.sum(subset.filter(d=> cameraKeywords.some(k=> (d.detection_method||'').toLowerCase().includes(k))), d=> d.fines_count||0),
        police: d3.sum(subset.filter(d=> !cameraKeywords.some(k=> (d.detection_method||'').toLowerCase().includes(k))), d=> d.fines_count||0)
      };
    }).filter(d=> d.year);
    if(byYearGroup.length===0){ g.append('text').text('No data').attr('x',10).attr('y',20); return; }

    const x = d3.scaleLinear().domain(d3.extent(byYearGroup, d=> d.year)).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, d3.max(byYearGroup, d=> Math.max(d.camera, d.police)) || 1]).nice().range([innerH,0]);

    // lines
    const lineCam = d3.line().x(d=> x(d.year)).y(d=> y(d.camera)).curve(d3.curveMonotoneX);
    const linePol = d3.line().x(d=> x(d.year)).y(d=> y(d.police)).curve(d3.curveMonotoneX);
    g.append('path').datum(byYearGroup).attr('fill','none').attr('stroke','#0b3d91').attr('stroke-width',3).attr('d', lineCam);
    g.append('path').datum(byYearGroup).attr('fill','none').attr('stroke','#d1495b').attr('stroke-width',3).attr('d', linePol);

    // points + tooltip
    ['camera','police'].forEach((k, idx)=>{
      g.selectAll('.pts-'+k).data(byYearGroup).enter().append('circle').attr('class','pts-'+k).attr('cx',d=> x(d.year)).attr('cy',d=> y(d[k])).attr('r',4).attr('fill','#fff').attr('stroke', idx===0? '#0b3d91' : '#d1495b').attr('stroke-width',2)
        .on('mouseover',(event,d)=>{ d3.selectAll('.tooltip').remove(); const tip = d3.select('body').append('div').attr('class','tooltip').html(`<strong>${d.year}</strong><br/>${k}: ${d[k].toLocaleString()}`); tip.style('left', (event.pageX+10) + 'px').style('top', (event.pageY+10) + 'px'); })
        .on('mouseout', ()=> d3.selectAll('.tooltip').remove());
    });

    // axes
    g.append('g').attr('transform',`translate(0,${innerH})`).attr('class','axis').call(d3.axisBottom(x).ticks(Math.min(years.length, 10)).tickFormat(d3.format('d')));
    g.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(',')));

    // Render legend outside the SVG as an HTML element to avoid overlapping the plotted lines
    try{
      // ensure the container can position absolute children
      container.style('position','relative');
      // remove any existing outside legend
      d3.select(container.node()).selectAll('.chart-legend-outside').remove();
      const legendDiv = d3.select(container.node()).append('div').attr('class','chart-legend-outside');
      const items = [['Camera','#0b3d91'], ['Police','#d1495b']];
      items.forEach(it => {
        const item = legendDiv.append('div').attr('class','legend-item');
        item.append('span').attr('class','legend-swatch').style('background', it[1]);
        item.append('span').attr('class','legend-label').text(it[0]);
      });
    }catch(e){
      // fallback: draw legend inside svg if HTML approach fails
      const legendWidth = 140;
      const legendX = Math.max(margin.left, w - legendWidth - 16);
      const legend = svg.append('g').attr('transform', `translate(${legendX},12)`).attr('class','chart-legend');
      [['Camera','#0b3d91'], ['Police','#d1495b']].forEach((it,i)=>{
        const gL = legend.append('g').attr('transform', `translate(0,${i*20})`);
        gL.append('rect').attr('width',12).attr('height',12).attr('fill', it[1]);
        gL.append('text').attr('x',18).attr('y',10).text(it[0]).attr('font-size','12px').attr('fill','#111827');
      });
    }
  }

  function updateAll(){
    const filtered = getFiltered();
    updateKPIs(filtered);
    // render only what's needed for the current page (keeps pages lightweight and fast)
    if(page === 'q1'){
      // Q1: trends + jurisdiction totals
      renderLine(filtered);
      renderJurisdictionBars(filtered);
    } else if(page === 'q2'){
      // Q2: age groups
      renderAge(filtered);
    } else if(page === 'q3'){
      // Q3: detection grouped (camera vs police by jurisdiction)
      renderDetectionGrouped(filtered);
    } else if(page === 'q4'){
      // Q4: location types
      renderLocationBar(filtered);
    } else if(page === 'q5'){
      // Q5: camera vs police over time
      renderCameraPoliceLines(filtered);
    } else {
      // default: legacy dashboard - render everything available
      renderLine(filtered);
      renderStacked(filtered);
      renderAge(filtered);
      renderTopRegions(filtered);
      if(topo) renderMap(topo);
    }
  }

  // Export filtered data as CSV (uses original CSV columns order)
  window.exportFilteredCSV = function(){
    const filtered = getFiltered();
    if(!filtered || filtered.length===0) return alert('No data to export for current filters.');
    const cols = data.columns && data.columns.length? data.columns : Object.keys(filtered[0]);
    const rows = filtered.map(r => cols.map(c => {
      const v = r[c] !== undefined ? r[c] : (r[c.toUpperCase()] !== undefined ? r[c.toUpperCase()] : '');
      // escape quotes
      return typeof v === 'string' && v.includes(',') ? '"' + v.replace(/"/g,'""') + '"' : v;
    }).join(','));
    const csv = cols.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'filtered_fines.csv'; a.click(); URL.revokeObjectURL(url);
  };

  // Simple PNG export placeholder
  window.exportDashboardPNG = function(){
    alert('PNG export not yet implemented. I can add html2canvas-based export if you want.');
  };

  // Wire up filter listeners
  const jurisEl = document.getElementById('jurisdiction'); if(jurisEl) jurisEl.addEventListener('change', e=>{ activeState = e.target.value; updateAll(); });
  const yearRangeEl = document.getElementById('yearRange'); if(yearRangeEl) yearRangeEl.addEventListener('input', e=>{ activeYear = +e.target.value; const yrSpan = document.getElementById('yr'); if(yrSpan) yrSpan.textContent = activeYear; updateAll(); });
  const detectionEl = document.getElementById('detection'); if(detectionEl) detectionEl.addEventListener('change', e=>{ activeDetections = Array.from(e.target.selectedOptions).map(o=>o.value); updateAll(); });
  const locTypeEl = document.getElementById('locType'); if(locTypeEl) locTypeEl.addEventListener('change', e=>{ activeLoc = e.target.value; updateAll(); });
  window.addEventListener('filtersChanged', updateAll);
  // Re-render charts on resize (debounced)
  function debounce(fn, delay){
    let t;
    return function(){
      const args = arguments; const ctx = this;
      clearTimeout(t); t = setTimeout(()=> fn.apply(ctx,args), delay);
    };
  }

  window.addEventListener('resize', debounce(()=>{
    updateAll();
  }, 200));

  // initial render
  updateAll();
})();
