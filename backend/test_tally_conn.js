
const axios = require('axios');
const tallyUrl = 'http://203.109.44.234:9000';

async function testTally() {
    console.log(`Testing Tally at ${tallyUrl}...`);
    try {
        const response = await axios.post(tallyUrl, {}, { timeout: 10000 });
        console.log('Tally responded with status:', response.status);
        console.log('Response Data Snippet:', JSON.stringify(response.data).substring(0, 500));
    } catch (error) {
        console.error('Tally connection failed:');
        if (error.code) console.error('Error Code:', error.code);
        if (error.message) console.error('Error Message:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        }
    }
}

testTally();
