// main.js - interactions + lightweight UI wiring

var yr = document.getElementById('yr');
var yearRange = document.getElementById('yearRange');
if(yearRange && yr){
  yearRange.addEventListener('input', function(e){ yr.textContent = e.target.value; });
}

var resetBtn = document.getElementById('reset');
if(resetBtn){
  resetBtn.addEventListener('click', function(){
    // Reset jurisdiction
    var juris = document.getElementById('jurisdiction');
    if(juris){ juris.value = 'all'; juris.dispatchEvent(new Event('change')); }

    // Reset year to max if slider exists (populateControls sets min/max)
    if(yearRange){
      try{ yearRange.value = yearRange.max || yearRange.defaultValue || yearRange.value; }catch(e){}
      if(yr) yr.textContent = yearRange.value;
      yearRange.dispatchEvent(new Event('input'));
    }

    // Reset detection control — support both multi and single selects
    var det = document.getElementById('detection');
    if(det){
      if(det.multiple){
        for(var i=0;i<det.options.length;i++) det.options[i].selected = false;
      } else {
        // choose first option or 'Both' if available
        var val = det.querySelector('option[value="Both"]') ? 'Both' : (det.options[0] ? det.options[0].value : '');
        det.value = val;
      }
      det.dispatchEvent(new Event('change'));
    }

    // Reset yearStart/yearEnd (trends page). Constrain to allowed years for selected detection.
    var ys = document.getElementById('yearStart');
    var ye = document.getElementById('yearEnd');
    if(ys && ye){
      // If d3_charts.js exposed helper via event, rely on min/max already set by detection change.
      // Otherwise, fall back to their current min/max.
      var minY = parseInt(ys.min || ys.value || '0', 10);
      var maxY = parseInt(ye.max || ye.value || '0', 10);
      if(minY && maxY && maxY>=minY){
        ys.value = minY;
        ye.value = maxY;
        ys.dispatchEvent(new Event('change'));
        ye.dispatchEvent(new Event('change'));
      }
    }

    // Reset location
    var locEl = document.getElementById('locType');
    if(locEl){ locEl.value = 'All'; locEl.dispatchEvent(new Event('change')); }

    // Fallback: notify any listeners in case specific controls are absent
    window.dispatchEvent(new CustomEvent('filtersChanged'));
  });
}


// download buttons
var downloadCsvBtn = document.getElementById('downloadCsv');
if(downloadCsvBtn){
  downloadCsvBtn.addEventListener('click', function(){
    if(window.exportFilteredCSV){
      window.exportFilteredCSV();
    } else {
      alert('Data not ready yet. Try again after the page loads.');
    }
  });
}

var downloadPngBtn = document.getElementById('downloadPng');
if(downloadPngBtn){
  downloadPngBtn.addEventListener('click', function(){
    if(window.exportDashboardPNG){
      window.exportDashboardPNG();
    } else {
      alert('Export PNG placeholder — implement using html2canvas or svg serialization');
    }
  });
}

