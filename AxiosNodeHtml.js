const axios = require('axios');
const express = require('express');
const { Product } = require('../backendProjs/index.js');
const app = express();
const port = 3000;

// ตั้งค่าให้ Express ใช้ EJS
app.set('view engine', 'ejs');
app.use(express.static('public'));

// ดึงข้อมูลเมนูจากฐานข้อมูล
app.get('/', async (req, res) => {
    try {
        const menu = await Product.findAll();
        console.log(menu);  
        res.render('index', { menu });
    } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).send('Error fetching menu');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
