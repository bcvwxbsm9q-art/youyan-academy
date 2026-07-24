const d = require('./data.json');
const cs = d.management_courses || [];
console.log('Total courses:', cs.length);
cs.forEach(c => {
  if (c.videos && c.videos.length > 0) {
    const v0 = c.videos[0];
    console.log('---');
    console.log('Course ID:', c.id, 'Title:', (c.title || '').substring(0, 40));
    console.log('Videos:', c.videos.length);
    console.log('Video[0] type:', typeof v0, 'keys:', Object.keys(v0).join(','));
    if (v0.interactionNodes) {
      console.log('interactionNodes count:', v0.interactionNodes.length);
      if (v0.interactionNodes.length > 0) {
        console.log('First node:', JSON.stringify(v0.interactionNodes[0]).substring(0, 200));
      }
    } else {
      console.log('NO interactionNodes on video[0]');
    }
  }
});
