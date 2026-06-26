const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './.env' }); // Load backend env vars

const API_URL = 'http://127.0.0.1:3000/api';
const TALLY_API_KEY = process.env.TALLY_API_KEY || 'v1_tally_admin_key_9x8p7L4k2M1n'; 
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_if_not_found';

// Generate mock tokens directly bypassing DB auth
const adminToken = jwt.sign({ sub: 999, username: 'test_admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const empToken = jwt.sign({ sub: 888, username: 'test_emp', role: 'employee' }, JWT_SECRET, { expiresIn: '1h' });

// Shared Ledger ID for testing 
const DEMO_LEDGER_ID = 1;

// Real items will be fetched dynamically below

async function runTestFlow() {
  try {
    console.log("====================================");
    console.log("🚀 STARTING END-TO-END TALLY SYNC TEST");
    console.log("====================================\n");

    // 1. Admin Flow
    console.log("--- 🕵️ ADMIN FLOW ---");
    console.log("✅ Admin Token Generated");

    // Grab a random real ledger to use
    const adminLedgerRes = await axios.get(`${API_URL}/reports/ledgers?limit=1`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    let testLedgerId = DEMO_LEDGER_ID;
    if (adminLedgerRes.data.data && adminLedgerRes.data.data.length > 0) {
        testLedgerId = adminLedgerRes.data.data[0].id;
    }

    // Fetch 2 real items to test against
    const itemsRes = await axios.get(`${API_URL}/reports/stock-items?limit=2`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    if (!itemsRes.data.data || itemsRes.data.data.length < 2) {
       throw new Error("Not enough stock items in DB to test");
    }
    const TEST_ITEMS = itemsRes.data.data;
    
    const adminOrderRes = await axios.post(`${API_URL}/orders`, {
      ledger_id: testLedgerId,
      date: new Date().toISOString().split('T')[0],
      total_amount: 30, // 5 + 25
      order_type: "Tax Invoice",
      remark: "Admin Automation Test",
      items: [
        { stock_item_id: TEST_ITEMS[0].masterid, item_name: TEST_ITEMS[0].name, quantity: 1, amount: 5, rate: 5, unit: 'Pcs', gst: 0, selected_scheme: 'Custom', selected_discount: 0, livestock_type: 'Shop' },
        { stock_item_id: TEST_ITEMS[1].masterid, item_name: TEST_ITEMS[1].name, quantity: 1, amount: 25, rate: 25, unit: 'Pcs', gst: 0, selected_scheme: 'Custom', selected_discount: 0, livestock_type: 'Shop' }
      ]
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    const adminOrderId = adminOrderRes.data.id;
    console.log(`✅ Admin Created Order #${adminOrderId} with 2 Mixed Items`);

    await axios.post(`${API_URL}/orders/${adminOrderId}/sync`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`✅ Admin Scheduled Order #${adminOrderId} for Tally Sync\n`);


    // 2. Employee Flow
    console.log("--- 👷 EMPLOYEE FLOW ---");
    console.log("✅ Employee Token Generated");

    const empOrderRes = await axios.post(`${API_URL}/orders`, {
      ledger_id: testLedgerId,
      date: new Date().toISOString().split('T')[0],
      total_amount: 50, // 25 * 2
      order_type: "Cash Sale",
      remark: "Employee Automation Test",
      items: [
        { stock_item_id: TEST_ITEMS[1].masterid, item_name: TEST_ITEMS[1].name, quantity: 2, amount: 50, rate: 25, unit: 'Pcs', gst: 0, selected_scheme: 'MRP', selected_discount: 0, livestock_type: 'Pan' }
      ]
    }, {
      headers: { Authorization: `Bearer ${empToken}` }
    });
    
    const empOrderId = empOrderRes.data.id;
    console.log(`✅ Employee Created Order #${empOrderId} with 1 Distinct Item`);

    await axios.post(`${API_URL}/orders/${empOrderId}/sync`, {}, {
      headers: { Authorization: `Bearer ${empToken}` }
    });
    console.log(`✅ Employee Scheduled Order #${empOrderId} for Tally Sync\n`);


    // Ensure the orders are retrieved even if they are far down the list.
    // Instead of hitting the /tally endpoint which is capped at 10, we'll verify via the standard admin /orders endpoint to check what saved properly
    const adminOrdersRaw = await axios.get(`${API_URL}/reports/orders?limit=100`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    // Process them locally just like Tally does to verify
    const pendingOrders = adminOrdersRaw.data.data.filter(o => o.id === adminOrderId || o.id === empOrderId);
    console.log(`📡 Admin Route fetched the 2 target test orders\n`);

    // Verify Admin Order Extraction
    const adminExport = pendingOrders.find(o => o.id === adminOrderId);
    if (adminExport) {
        console.log(`📋 Admin Order Export Data:`);
        console.log(`   Remark: ${adminExport.remark}`);
        // Fetch the explicit details for the order 
        const adminOrderDetailsRes = await axios.get(`${API_URL}/orders/${adminOrderId}/details`, { headers: { Authorization: `Bearer ${adminToken}` }});
        const details = adminOrderDetailsRes.data;

        console.log(`   Items Found: ${details.length}`);
        details.forEach((item, index) => {
            console.log(`     - Item ${index + 1}: ${item.item_name} (Qty: ${item.quantity})`);
        });
        
        // Assertions
        const i1Name = details[0]?.item_name;
        const i2Name = details[1]?.item_name;
        if (i1Name !== i2Name && i1Name && i2Name) {
            console.log("   🎉 RESULT: PASS - The items correctly maintained their distinct identities!");
        } else {
             console.log("   ❌ RESULT: FAIL - Items were mutated or overwritten.");
        }
    } else {
        console.log("   ❌ RESULT: FAIL - Admin Order not found in extract.");
    }
    console.log("");

    // Verify Employee Order Extraction
    const empExport = pendingOrders.find(o => o.id === empOrderId);
    if (empExport) {
        console.log(`📋 Employee Order Export Data:`);
        console.log(`   Remark: ${empExport.remark}`);
        const empOrderDetailsRes = await axios.get(`${API_URL}/orders/${empOrderId}/details`, { headers: { Authorization: `Bearer ${empToken}` }});
        const empDetails = empOrderDetailsRes.data;

        console.log(`   Items Found: ${empDetails.length}`);
        empDetails.forEach((item, index) => {
            console.log(`     - Item ${index + 1}: ${item.item_name} (Qty: ${item.quantity})`);
        });

         // Assertions
         if (empDetails[0]?.item_name === TEST_ITEMS[1].name) {
            console.log("   🎉 RESULT: PASS - Employee order correctly isolated and extracted.");
        } else {
             console.log("   ❌ RESULT: FAIL - Items were mutated or overwritten.");
        }
    } else {
        console.log("   ❌ RESULT: FAIL - Employee Order not found in extract.");
    }

    console.log("\n====================================");
    console.log("✅ AUTOMATED TEST CYCLE COMPLETE");
    console.log("====================================");

  } catch (error) {
    console.error("Test failed:");
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

runTestFlow();
