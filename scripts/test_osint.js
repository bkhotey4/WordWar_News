const https = require('https');

async function testOSINT() {
  console.log('Testing OSINT sources...');
  
  // 1. Taiwan MND Official Military News RSS/HTML Test
  try {
    const res = await fetch('https://www.mnd.gov.tw/PublishTable.aspx?Types=%E8%BB%8D%E4%BA%8B%E6%B6%88%E6%81%AF', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    console.log('Taiwan MND Feed HTTP Status:', res.status);
  } catch (err) {
    console.error('MND Feed Error:', err.message);
  }

  // 2. OpenSky Network Taiwan Strait Bounding Box Live ADS-B Tracking
  try {
    // Taiwan Strait Bounding Box: 21.0 to 26.5 N, 118.0 to 123.0 E
    const url = 'https://opensky-network.org/api/states/all?lamin=21.0&lomin=118.0&lamax=26.5&lomax=123.0';
    const res = await fetch(url, { headers: { 'User-Agent': 'WordWarNews/2.0' } });
    const data = await res.json();
    console.log(`OpenSky live aircraft in Taiwan Strait: ${data.states ? data.states.length : 0}`);
    if (data.states && data.states.length > 0) {
      // Find foreign/special aircraft or abnormal positions
      const notable = data.states.filter(s => {
        const country = s[2] || '';
        const callsign = (s[1] || '').trim();
        const alt = s[7] || 0; // meters
        const lon = s[5];
        const lat = s[6];
        // Russian, non-commercial, or mid-strait (119-120E, 23-25N)
        return country.toLowerCase().includes('russia') || 
               country.toLowerCase().includes('korea') ||
               (lon >= 119.0 && lon <= 120.2 && lat >= 23.5 && lat <= 25.5);
      });
      console.log(`Found ${notable.length} notable/mid-strait planes:`);
      notable.slice(0, 5).forEach(s => {
        console.log(` - Callsign: ${s[1]} | ICAO: ${s[0]} | Country: ${s[2]} | Pos: [${s[6]}, ${s[5]}] | Alt: ${Math.round((s[7]||0)*3.28084)}ft | Spd: ${Math.round((s[9]||0)*1.94384)}kts`);
      });
    }
  } catch (err) {
    console.error('OpenSky Error:', err.message);
  }
}

testOSINT();
