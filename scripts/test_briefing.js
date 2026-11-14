const test=require('node:test');
const assert=require('node:assert/strict');
const {selectCitedAssets}=require('./site_briefing');

test('briefing exports only verified products cited by a report',()=>{
  const reports=[{imagery:[{region:'ukraine_civil',productId:'scene-1',sha256:'a'.repeat(64)}]}];
  const assets=[
    {region:'ukraine_civil',productId:'scene-1',sha256:'a'.repeat(64),verified:true},
    {region:'ukraine_civil',productId:'scene-2',sha256:'b'.repeat(64),verified:true},
    {region:'ukraine_civil',productId:'scene-1',sha256:'c'.repeat(64),verified:true},
    {region:'ukraine_civil',productId:'scene-1',sha256:'a'.repeat(64),verified:false}
  ];
  assert.deepEqual(selectCitedAssets(reports,assets),[assets[0]]);
  assert.deepEqual(selectCitedAssets([{imagery:[]}],assets),[]);
});
