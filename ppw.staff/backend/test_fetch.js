const axios = require('axios');
(async () => {
  try {
    const response = await axios.get('http://localhost:3000/orders/customer/1234567890');
    console.log('Fetch Success:', response.status);
    console.log('Data:', JSON.stringify(response.data.slice(0, 1)));
  } catch (e) {
    if (e.response) {
      console.error('Fetch Failed:', e.response.status, e.response.data);
    } else {
      console.error('Error:', e.message);
    }
  }
  process.exit(0);
})();
