async function testPTT() {
  try {
    const res = await fetch('https://www.ptt.cc/bbs/Military/index.html', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cookie': 'over18=1'
      }
    });
    const html = await res.text();
    console.log('PTT Military Length:', html.length);
    const regex = /<div class="title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/g;
    let match;
    const posts = [];
    while ((match = regex.exec(html)) !== null) {
      posts.push({ url: 'https://www.ptt.cc' + match[1], title: match[2].trim() });
    }
    console.log(`Found ${posts.length} PTT Military posts:`);
    posts.slice(0, 10).forEach(p => console.log(' -', p.title, `(${p.url})`));
  } catch (e) {
    console.error('PTT Error:', e.message);
  }
}

testPTT();
