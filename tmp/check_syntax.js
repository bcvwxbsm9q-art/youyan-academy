const fs = require('fs');
const content = fs.readFileSync('center.html', 'utf-8');

// Extract the main script block (the one with inline code)
const scriptMatch = content.match(/<script>\s*([\s\S]*?)\s*<\/script>/g);
if (scriptMatch && scriptMatch.length > 0) {
    // Get the last script block (which should be the main inline script)
    const lastScript = scriptMatch[scriptMatch.length - 1];
    const scriptContent = lastScript.replace(/<\/?script>/g, '').trim();
    
    try {
        // Try to parse as JavaScript
        new Function(scriptContent);
        console.log('✓ JavaScript syntax is valid');
    } catch (e) {
        console.error('✗ JavaScript syntax error:');
        console.error(e.message);
        // Find the line number
        const lines = scriptContent.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (i >= Math.max(0, e.lineNumber - 5) && i <= e.lineNumber + 5) {
                console.log(`${i + 1}: ${lines[i]}`);
            }
        }
    }
} else {
    console.log('No inline script found');
}
