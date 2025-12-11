// main.js - interactions + lightweight UI wiring

var yr = document.getElementById('yr');
var yearRange = document.getElementById('yearRange');
if(yearRange && yr){
  yearRange.addEventListener('input', function(e){ yr.textContent = e.target.value; });
}

var resetBtn = document.getElementById('reset');
if(resetBtn){
  resetBtn.addEventListener('click', function(){
  document.getElementById('jurisdiction').value = 'all';
    if(yearRange){ yearRange.value = 2016; }
    if(yr) yr.textContent = 2016;
  // clear multi-select detection
  var det = document.getElementById('detection');
  if(det){ for(var i=0;i<det.options.length;i++) det.options[i].selected = false; }
  document.getElementById('locType').value = 'All';
  // trigger redraw
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

