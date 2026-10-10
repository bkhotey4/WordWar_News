const cheerio=require('cheerio');
const urls=[
 'https://news.usni.org/category/foreign-forces/china',
 'https://warontherocks.com/chinas-warrior-scientists-insights-from-recent-operations-around-taiwan/',
 'https://efe.com/english/latest-news/2026-09-22/ukraines-offensive-operation-disrupts-russian-plans-to-capture-key-bastions-in-donetsk/',
 'https://money.udn.com/money/amp/story/7307/9780312',
 'https://www.criticalthreats.org/analysis/russian-offensive-campaign-assessment-september-26-2026'
];
Promise.all(urls.map(async url=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);const $=cheerio.load(await r.text());console.log(JSON.stringify({url,title:$('h1').first().text().trim(),dates:$('meta[property="article:published_time"],meta[itemprop="datePublished"],time[datetime]').map((_,e)=>$(e).attr('content')||$(e).attr('datetime')).get(),feeds:$('link[type="application/rss+xml"]').map((_,e)=>$(e).attr('href')).get(),bodyLength:$('article p,.entry-content p').text().length,cna:$('a[href*="cna.com.tw"]').map((_,e)=>$(e).attr('href')).get().slice(0,4)}));}catch(e){console.log(JSON.stringify({url,error:e.message}));}}));
