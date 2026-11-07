const {refreshSatelliteAssets,getSatelliteFeed}=require('../src/satellite_assets');
refreshSatelliteAssets({force:process.argv.includes('--force')}).then(health=>{
 const feed=getSatelliteFeed();console.log(JSON.stringify({health,count:feed.assets.length,regions:[...new Set(feed.assets.map(a=>a.region))]}));
 if(health.status!=='ONLINE')process.exitCode=1;
}).catch(e=>{console.error(e.message);process.exitCode=1;});
