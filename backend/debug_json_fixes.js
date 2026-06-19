const fs = require('fs');

try {
    // Read the file (or a chunk of it)
    const filePath = 'd:/projects/abs/ppw/list-of-stock-items.json';
    let rawData = fs.readFileSync(filePath, 'utf-8');

    console.log('Original length:', rawData.length);

    // 1. Sanitize control characters
    // Remove characters 0-31 and 127, EXCEPT newline (\n), carriage return (\r), and tab (\t)
    // Common safe control chars are: \t (9), \n (10), \r (13)
    // So we remove [\x00-\x08\x0B\x0C\x0E-\x1F\x7F]
    // Or just use the user's observed \u0004
    let sanitized = rawData.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    console.log('After char sanitization length:', sanitized.length);

    // 2. Fix invalid JSON structure: unnamed objects
    // Look for pattern: , { "desc"
    // We will verify if this pattern exists
    const invalidPattern = /,\s*\{\s*"desc"/;
    const match = sanitized.match(invalidPattern);
    if (match) {
        console.log('Found invalid pattern:', match[0]);
    } else {
        console.log('Did not find the specific invalid pattern like , { "desc"');
        // Let's print a small context around where parsing might fail
    }

    // Attempt fix
    // Replace: , { "desc"  ->  , "custom_field_INDEX": { "desc"
    let counter = 0;
    const fixedInfo = sanitized.replace(/,\s*\{\s*"desc"/g, (match) => {
        counter++;
        return `, "fix_${counter}": { "desc"`;
    });

    console.log(`Replaced ${counter} occurrences.`);

    // Try to parse
    const parsed = JSON.parse(fixedInfo);
    console.log('Successfully parsed!');
    console.log('Status:', parsed.status);
    console.log('First item:', parsed.data?.collection?.[0]?.metadata?.name);
    if (parsed.data?.collection?.[0]) {
        console.log('First item keys:', Object.keys(parsed.data.collection[0]));
    }

} catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('position')) {
        const pos = parseInt(error.message.match(/position (\d+)/)?.[1] || 0);
        console.log('Error context:', error.message);
        // We can't access rawData easily here if it fails on fixedInfo, but we can guess
    }
}
