const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const proj4=require('proj4');
const {createCanvas,ImageData}=require('@napi-rs/canvas');
const WEBP_QUALITY=90;
function cropWindow(transform,shape,epsg,bbox) {
  const zone=epsg%100;
  if(![326,327].includes(Math.floor(epsg/100))||zone<1||zone>60||transform.length!==6||!transform.every(Number.isFinite)||!shape.every(n=>Number.isInteger(n)&&n>0)||!bbox.every(Number.isFinite)||transform[1]!==0||transform[3]!==0||transform[0]<=0||transform[4]>=0)throw new Error('Unsupported georeference');
  const definition=`+proj=utm +zone=${zone} ${epsg>=32700?'+south':''} +datum=WGS84 +units=m +no_defs`;
  const points=[[bbox[0],bbox[1]],[bbox[0],bbox[3]],[bbox[2],bbox[1]],[bbox[2],bbox[3]]].map(p=>proj4('EPSG:4326',definition,p));
  const xs=points.map(p=>(p[0]-transform[2])/transform[0]),ys=points.map(p=>(p[1]-transform[5])/transform[4]);
  const window=[Math.max(0,Math.floor(Math.min(...xs))),Math.max(0,Math.floor(Math.min(...ys))),Math.min(shape[1],Math.ceil(Math.max(...xs))),Math.min(shape[0],Math.ceil(Math.max(...ys)))];
  if(window[2]<=window[0]||window[3]<=window[1])throw new Error('Region does not intersect raster');
  return window;
}
async function cropSatellite(record,target,item) {
  const visual=item.assets?.visual;
  const href=visual?.href;
  const url=new URL(href);
  if(url.protocol!=='https:'||url.hostname!=='sentinel-cogs.s3.us-west-2.amazonaws.com'||url.username||url.password)throw new Error('Unapproved raster source');
  const transform=visual['proj:transform'],shape=visual['proj:shape'],epsg=item.properties['proj:epsg'];
  if(!Array.isArray(transform)||!Array.isArray(shape)||shape.length!==2)throw new Error('Raster georeference missing');
  const bbox=[Math.max(target.bbox[0],item.bbox[0]),Math.max(target.bbox[1],item.bbox[1]),Math.min(target.bbox[2],item.bbox[2]),Math.min(target.bbox[3],item.bbox[3])];
  if(bbox[0]>=bbox[2]||bbox[1]>=bbox[3])throw new Error('Image footprint outside requested region');
  const window=cropWindow(transform,shape,epsg,bbox);
  const {fromUrl}=await import('geotiff');
  const signal=AbortSignal.timeout(60000);
  const tiff=await fromUrl(href,{allowFullFile:false,blockSize:65536,cacheSize:100},signal);
  const image=await tiff.getImage();
  try {
    if(image.getWidth()!==shape[1]||image.getHeight()!==shape[0]||image.getSamplesPerPixel()<3)throw new Error('Raster shape mismatch');
    const scale=Math.min(1,1024/Math.max(window[2]-window[0],window[3]-window[1]));
    const width=Math.max(1,Math.round((window[2]-window[0])*scale)),height=Math.max(1,Math.round((window[3]-window[1])*scale));
    const raster=await image.readRasters({window,width,height,samples:[0,1,2],interleave:true,resampleMethod:'bilinear',signal});
    const pixels=new Uint8ClampedArray(width*height*4);
    for(let i=0;i<width*height;i++){pixels[4*i]=raster[3*i];pixels[4*i+1]=raster[3*i+1];pixels[4*i+2]=raster[3*i+2];pixels[4*i+3]=255;}
    const canvas=createCanvas(width,height);canvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
    // WebP 品質 90：約為 PNG 的 1/5 大小；雜湊記錄的是實際存檔的 WebP
    const buffer=await canvas.encode('webp',WEBP_QUALITY);
    const file=`images/sentinel/${record.productId}_${target.targetKey}_crop.webp`;
    const full=path.join(__dirname,'../public',file),temporary=`${full}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary,buffer);fs.renameSync(temporary,full);
    return {...record,previewFile:record.file,file,imageUrl:`/${file}`,assetUrl:href,kind:'SOURCE_AOI_CROP',credit:`Modified Copernicus Sentinel data ${new Date(record.acquiredAt).getUTCFullYear()}; source: Element84 Earth Search`,
      requestedBbox:target.bbox,cropBbox:bbox,pixelWindow:window,sourceEpsg:epsg,sourceTransform:transform,outputSize:[width,height],sourcePixelSizeMeters:visual.gsd??transform[0],
      processing:`原始真彩色 TCI 依來源座標裁切並縮放，以 WebP（品質 ${WEBP_QUALITY}）壓縮保存；未補造像素、未去雲、未辨識軍事物件。`,scope:'來源影像區域裁切；覆蓋與雲遮需覆核，未判讀兵力或戰損。',
      downloadedAt:new Date().toISOString(),sha256:crypto.createHash('sha256').update(buffer).digest('hex'),verified:true};
  }finally{await tiff.close();}
}
module.exports={cropWindow,cropSatellite,WEBP_QUALITY};
