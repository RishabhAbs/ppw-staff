const axios = require('axios');

async function seed() {
    try {
        console.log('Placing a real test order...');
        const response = await axios.post('http://localhost:3000/api/orders/online', {
            name: "Jai Jha (Real Test)",
            phone: "9876543210",
            address: "123 Test Sector, Delhi",
            pincode: "110001",
            state: "Delhi",
            total: 3500,
            remark: "First production test order",
            ledger_id: 1,
            items: [
                { name: "Premium Leather Wallet", quantity: 2, price: 1000 },
                { name: "Stainless Steel Watch", quantity: 1, price: 1500 }
            ]
        });
        console.log('Success! Order ID:', response.data.id);
    } catch (e) {
        console.error('Failed to seed:', e.response?.data || e.message);
    }
}

seed();
