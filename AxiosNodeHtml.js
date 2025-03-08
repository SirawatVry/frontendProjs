const axios = require('axios');
const express = require('express');
const { Sequelize, sequelize, Product, Order, Payment, Customer ,MaterialProduct,Material,Delivery,Employees,customerId, Promotion} = require('../backendProjs/index.js');
const app = express();
app.use(express.json());
const port = 3000;

// ตั้งค่าให้ Express ใช้ EJS
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// ดึงข้อมูลเมนูจากฐานข้อมูล
// Main route to render the index page
app.get('/', async (req, res) => {
    const customerId = req.query.customerId; // รับ customerId จาก query parameters
    console.log('Customer ID from query:', customerId); // Debugging
    try {
        const menu = await Product.findAll();
        res.render('index', { menu, customerId }); // ส่ง customerId ไปยัง view
    } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).send('Error fetching menu');
    }
});

// เส้นทางสำหรับการชำระเงิน
app.get('/payment', async (req, res) => {
    const productId = req.query.productId;
    const quantity = req.query.quantity;
    const customerId = req.query.customerId; // รับ customerId จาก query parameters

    try {
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        const totalPrice = product.Product_Price * quantity;

        res.render('payment', { product, quantity, totalPrice, customerId }); // ส่ง customerId ไปยัง view
    } catch (error) {
        console.error('Error fetching product for payment:', error);
        res.status(500).send('Error fetching product for payment');
    }
});

// เส้นทางสำหรับการตรวจสอบรหัสโปรโมชั่น
app.get('/validate-promotion', async (req, res) => {
    const promotionCode = req.query.code; // รับรหัสโปรโมชั่นจาก query parameter

    try {
        const [promotion] = await sequelize.query(
            'SELECT * FROM Promotions WHERE Promotion_Name = :promotionCode', 
            {
                replacements: { promotionCode },
                type: Sequelize.QueryTypes.SELECT
            }
        );

        if (promotion) {
            const discount = promotion.Promotion_Discount;
            return res.json({ valid: true, discount: discount });
        } else {
            return res.json({ valid: false });
        }
    } catch (error) {
        console.error('Error validating promotion code:', error);
        res.status(500).send('Error validating promotion code');
    }
});

// เส้นทางสำหรับการประมวลผลการชำระเงิน
// Route for processing payment
app.post('/process-payment', async (req, res) => {
    const { productId, quantity, paymentType, promotionCode, customerId } = req.body; // Include customerId in the request

    try {
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Fetch materials for the product
        const materials = await MaterialProduct.findAll({
            where: { Product_ID: productId }
        });

        // Check if there are enough materials
        let insufficientMaterials = [];
        for (const material of materials) {
            const materialRecord = await Material.findByPk(material.Material_ID);
            if (materialRecord) {
                const requiredQuantity = 1 * quantity; // Adjust this logic based on your needs
                if (materialRecord.Material_Quantity < requiredQuantity) {
                    insufficientMaterials.push({
                        materialId: material.Material_ID,
                        required: requiredQuantity,
                        available: materialRecord.Material_Quantity
                    });
                }
            }
        }

        // If there are insufficient materials, return an error
        if (insufficientMaterials.length > 0) {
            return res.status(400).json({
                message: 'Insufficient materials for the following items:',
                insufficientMaterials
            });
        }

        // Calculate subtotal
        const subtotal = product.Product_Price * quantity;
        let discountAmount = 0;
        let promotionId = null;

        // Check if a promotion code was provided and validate it
        if (promotionCode) {
            const [promotion] = await sequelize.query(
                'SELECT * FROM Promotions WHERE Promotion_Name = :promotionCode',
                {
                    replacements: { promotionCode },
                    type: Sequelize.QueryTypes.SELECT
                }
            );

            if (promotion) {
                discountAmount = (subtotal * promotion.Promotion_Discount) / 100; // Calculate discount
                promotionId = promotion.Promotion_ID; // Get the Promotion_ID
            }
        }

        // Calculate total price
        const deliveryFee = 30; // Example delivery fee
        const totalPrice = subtotal - discountAmount + deliveryFee;

        // Create the order using the customer ID from the request
        const order = await Order.create({
            Order_Datetime: new Date(),
            Order_Customer_ID: customerId, // Use the customer ID from the request
            Order_Product_ID: productId,
            Order_Quantity: quantity,
            Order_Price_Unit: product.Product_Price,
            Order_Total_Price: totalPrice // Store the total price after discount
        });

        // Deduct materials based on the ordered quantity
        for (const material of materials) {
            const materialRecord = await Material.findByPk(material.Material_ID);
            if (materialRecord) {
                const requiredQuantity = 1 * quantity; // Adjust this logic based on your needs
                materialRecord.Material_Quantity -= requiredQuantity;

                // Update the material record
                await materialRecord.save();
            }
        }

        // Set payment status based on payment type
        const paymentStatus = paymentType === 'COD' ? 'Waiting for payment' : 'Pending';

        // Create the payment record
        await Payment.create({
            Payment_Type: paymentType,
            Payment_Amount: totalPrice,
            Payment_Date: new Date(),
            Payment_Order_ID: order.Order_ID,
            Payment_Status: paymentStatus,
            Payment_Promotion_ID: promotionId
        });

        // Fetch delivery drivers
        const deliveryDrivers = await Employees.findAll({
            where: { Employees_Position: 'Delivery Driver' }
        });

        // Check if there are any delivery drivers available
        if (deliveryDrivers.length === 0) {
            return res.status(400).send('No delivery drivers available');
        }

        // Randomly select a delivery driver
        const randomDriver = deliveryDrivers[Math.floor(Math.random() * deliveryDrivers.length)];

        // Create a delivery record
        await Delivery.create({
            Delivery_Status: 'In transit',
            Delivery_date: new Date(),
            Delivery_Order_ID: order.Order_ID,
            Delivery_Employees_ID: randomDriver.Employees_ID
        });

        res.status(200).json({ message: 'Payment processed successfully and delivery assigned.' });
    } catch (error) {
        console.error('Error processing payment:', error.message); // Log the error message
        res.status(500).send(`Error processing payment: ${error.message}`); // Send the error message in the response
    }
});

// Route for shipping page
// Route for shipping page
app.get('/shipping', async (req, res) => {
    const customerId = req.query.customerId;

    if (!customerId) {
        console.log('Customer ID is required');
        return res.status(400).send('Customer ID is required');
    }

    try {
        const deliveries = await Delivery.findAll({
            include: [
                {
                    model: Order,
                    where: { Order_Customer_ID: customerId }, // ใช้ Order_Customer_ID ในการกรอง
                    include: [
                        {
                            model: Product,
                            attributes: ['Product_Name']
                        },
                        {
                            model: Customer,
                            attributes: ['Customer_Name', 'Customer_address'] // ดึง Customer_Name และ Customer_address
                        }
                    ],
                    attributes: ['Order_ID', 'Order_Quantity', 'Order_Total_Price', 'Order_Datetime']
                },
                {
                    model: Employees,
                    attributes: ['Employees_Name', 'Employees_Phonenumber']
                }
            ]
        });

        console.log(JSON.stringify(deliveries, null, 2));  // ตรวจสอบข้อมูลที่ได้จาก query
        res.render('shipping', { deliveries });
    } catch (error) {
        console.error('Error fetching delivery data:', error);
        res.status(500).send('Error fetching delivery data');
    }
});





// Route for login page
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { phone } = req.body;
    console.log('Login attempt with phone:', phone); // Debugging

    try {
        const customer = await Customer.findOne({ where: { Customer_Phonenumber: phone } });
        if (customer) {
            console.log('Customer found:', customer.Customer_ID); // Debugging
            return res.redirect(`/?customerId=${customer.Customer_ID}`);
        }

        const employee = await Employees.findOne({ where: { Employees_Phonenumber: phone, Employees_Position: 'admin' } });
        if (employee) {
            console.log('Admin found, redirecting to admin page'); // Debugging
            return res.redirect('/admin');
        }

        console.log('Invalid phone number'); // Debugging
        res.status(401).send('Invalid phone number');
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Internal server error');
    }
});

// Example routes for menu and admin pages
app.get('/menu', (req, res) => {
    res.send('Welcome to the Menu Page!');
});

// Route for admin page
app.get('/admin', async (req, res) => {
    try {
        // ดึงข้อมูลจากหลายๆ ตาราง
        const materials = await Material.findAll();
        const customers = await Customer.findAll();
        const employees = await Employees.findAll();
        const products = await Product.findAll();
        const orders = await Order.findAll();
        const payments = await Payment.findAll();
        const promotions = await Promotion.findAll();
        const deliveries = await Delivery.findAll();

        // เพิ่มการดึงข้อมูลจากการ JOIN ตารางต่างๆ
        const paymentsWithDetails = await sequelize.query(`
SELECT o.Order_ID, c.Customer_Name, c.Customer_address, c.Customer_Phonenumber,
       p.Product_Name AS Order_Product_Name, o.Order_Quantity, 
       o.Order_Total_Price AS TotalPrice, o.Order_Datetime, 
       pay.Payment_Type, 
       CASE 
           WHEN promo.Promotion_Discount IS NOT NULL THEN promo.Promotion_Discount 
           ELSE NULL 
       END AS Promotion_Discount
FROM orders o
JOIN customers c ON o.Order_Customer_ID = c.Customer_ID
JOIN products p ON o.Order_Product_ID = p.Product_ID
JOIN payments pay ON o.Order_ID = pay.Payment_Order_ID
LEFT JOIN promotions promo ON pay.Payment_Promotion_ID = promo.Promotion_ID;

        `, { type: Sequelize.QueryTypes.SELECT });
        
        
        
        
        // ส่งข้อมูลทั้งหมดไปยัง EJS
        res.render('admin', {
            materials,
            customers,
            employees,
            products,
            orders,
            payments: paymentsWithDetails, // ส่งผลลัพธ์การชำระเงินที่ได้จากการ JOIN
            promotions,
            deliveries
        });
    } catch (error) {
        console.error('Error fetching admin data:', error);
        res.status(500).send('Error fetching admin data');
    }
});


app.get('/register', (req, res) => {
    res.render('register');
});

// Route to handle registration logic
app.post('/register', async (req, res) => {
    const { name, phone, address } = req.body;

    try {
        // Check if the phone number already exists
        const existingCustomer = await Customer.findOne({ where: { Customer_Phonenumber: phone } });
        if (existingCustomer) {
            return res.status(400).send('Phone number already registered.');
        }

        // Create a new customer
        const newCustomer = await Customer.create({
            Customer_Name: name,
            Customer_Phonenumber: phone,
            Customer_address: address
        });

        res.redirect('/login');
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).send('Internal server error');
    }
});
// Route to delete material



// Route to delete customer
app.delete('/delete-customer', async (req, res) => {
    const { id } = req.query;
    try {
        await Customer.destroy({ where: { Customer_ID: id } });
        res.status(200).send('Customer deleted successfully');
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).send('Error deleting customer');
    }
});

// Route to delete employee
app.delete('/delete-employee', async (req, res) => {
    const { id } = req.query;
    try {
        await Employees.destroy({ where: { Employees_ID: id } });
        res.status(200).send('Employee deleted successfully');
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).send('Error deleting employee');
    }
});

// Route to delete product
app.delete('/delete-product', async (req, res) => {
    const { id } = req.query;
    try {
        await Product.destroy({ where: { Product_ID: id } });
        res.status(200).send('Product deleted successfully');
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).send('Error deleting product');
    }
});

// Route to delete order
app.delete('/delete-order', async (req, res) => {
    const { id } = req.query;
    try {
        await Order.destroy({ where: { Order_ID: id } });
        res.status(200).send('Order deleted successfully');
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).send('Error deleting order');
    }
});

// Route to delete payment
app.delete('/delete-payment', async (req, res) => {
    const { id } = req.query;
    try {
        await Payment.destroy({ where: { Payment_ID: id } });
        res.status(200).send('Payment deleted successfully');
    } catch (error) {
        console.error('Error deleting payment:', error);
        res.status(500).send('Error deleting payment');
    }
});

// Route to delete promotion
app.delete('/delete-promotion', async (req, res) => {
    const { id } = req.query;
    try {
        await Promotion.destroy({ where: { Promotion_ID: id } });
        res.status(200).send('Promotion deleted successfully');
    } catch (error) {
        console.error('Error deleting promotion:', error);
        res.status(500).send('Error deleting promotion');
    }
});

// Route to delete delivery
app.delete('/delete-delivery', async (req, res) => {
    const { id } = req.query;
    try {
        await Delivery.destroy({ where: { Delivery_ID: id } });
        res.status(200).send('Delivery deleted successfully');
    } catch (error) {
        console.error('Error deleting delivery:', error);
        res.status(500).send('Error deleting delivery');
    }
});
// Route to get edit material form
app.get('/edit-material', async (req, res) => {
    const { id } = req.query;
    try {
        const material = await Material.findByPk(id);
        res.render('edit-material', { material });
    } catch (error) {
        console.error('Error fetching material for edit:', error);
        res.status(500).send('Error fetching material for edit');
    }
});

// Route to get edit customer form
app.get('/edit-customer', async (req, res) => {
    const { id } = req.query;
    try {
        const customer = await Customer.findByPk(id);
        res.render('edit-customer', { customer });
    } catch (error) {
        console.error('Error fetching customer for edit:', error);
        res.status(500).send('Error fetching customer for edit');
    }
});

// Route to get edit employee form
app.get('/edit-employee', async (req, res) => {
    const { id } = req.query;
    try {
        const employee = await Employees.findByPk(id);
        res.render('edit-employee', { employee });
    } catch (error) {
        console.error('Error fetching employee for edit:', error);
        res.status(500).send('Error fetching employee for edit');
    }
});

// Route to get edit product form
app.get('/edit-product', async (req, res) => {
    const { id } = req.query;
    try {
        const product = await Product.findByPk(id);
        res.render('edit-product', { product });
    } catch (error) {
        console.error('Error fetching product for edit:', error);
        res.status(500).send('Error fetching product for edit');
    }
});

// Route to get edit order form
app.get('/edit-order', async (req, res) => {
    const { id } = req.query;
    try {
        const order = await Order.findByPk(id);
        res.render('edit-order', { order });
    } catch (error) {
        console.error('Error fetching order for edit:', error);
        res.status(500).send('Error fetching order for edit');
    }
});

// Route to get edit payment form
app.get('/edit-payment', async (req, res) => {
    const { id } = req.query;
    try {
        const payment = await Payment.findByPk(id);
        res.render('edit-payment', { payment });
    } catch (error) {
        console.error('Error fetching payment for edit:', error);
        res.status(500).send('Error fetching payment for edit');
    }
});

// Route to get edit promotion form
app.get('/edit-promotion', async (req, res) => {
    const { id } = req.query;
    try {
        const promotion = await Promotion.findByPk(id);
        res.render('edit-promotion', { promotion });
    } catch (error) {
        console.error('Error fetching promotion for edit:', error);
        res.status(500).send('Error fetching promotion for edit');
    }
});

// Route to get edit delivery form
app.get('/edit-delivery', async (req, res) => {
    const { id } = req.query;
    try {
        const delivery = await Delivery.findByPk(id);
        res.render('edit-delivery', { delivery });
    } catch (error) {
        console.error('Error fetching delivery for edit:', error);
        res.status(500).send('Error fetching delivery for edit');
    }
});
// Route to update material
app.post('/update-material', async (req, res) => {
    const { id, name, quantity } = req.body;
    try {
        await Material.update({ Material_Name: name, Material_Quantity: quantity }, { where: { Material_ID: id } });
        res.redirect('/admin'); // Redirect to admin page after update
    } catch (error) {
        console.error('Error updating material:', error);
        res.status(500).send('Error updating material');
    }
});

// Route to update customer
app.post('/update-customer', async (req, res) => {
    const { id, name, phone } = req.body;
    try {
        await Customer.update({ Customer_Name: name, Customer_Phonenumber: phone }, { where: { Customer_ID: id } });
        res.redirect('/admin'); // Redirect to admin page after update
    } catch (error) {
        console.error('Error updating customer:', error);
        res.status(500).send('Error updating customer');
    }
});

// Route to update employee
app.post('/update-employee', async (req, res) => {
    const { id, name, position, phone } = req.body;
    try {
        await Employees.update({ Employees_Name: name, Employees_Position: position, Employees_Phonenumber: phone }, { where: { Employees_ID: id } });
        res.redirect('/admin'); // Redirect to admin page after update
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).send('Error updating employee');
    }
});

// Route to update product
app.post('/update-product', async (req, res) => {
    const { id, name, price, description } = req.body;
    try {
        await Product.update({ Product_Name: name, Product_Price: price, Product_Description: description }, { where: { Product_ID: id } });
        res.redirect('/admin'); // Redirect to admin page after update
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).send('Error updating product');
    }
});

// Route to update order
app.post('/update-order', async (req, res) => {
    const { id, quantity, totalPrice } = req.body;
    try {
        await Order.update({ Order_Quantity: quantity, Order_Total_Price: totalPrice }, { where: { Order_ID: id } });
        res.redirect('/admin'); // Redirect to admin page after update
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).send('Error updating order');
    }
});

// Route to update payment
app.post('/update-payment', async (req, res) => {
    const { id, type, amount } = req.body;
    try {
        await Payment.update({ Payment_Type: type, Payment_Amount: amount }, { where: { Payment_ID: id } });
        res.redirect('/admin'); // Redirect to admin page after update
    } catch (error) {
        console.error('Error updating payment:', error);
        res.status(500).send('Error updating payment');
    }
});

// Route to update promotion
app.post('/update-promotion', async (req, res) => {
    const { id, name, discount } = req.body;
    try {
        await Promotion.update({ Promotion_Name: name, Promotion_Discount: discount }, { where: { Promotion_ID: id } });
        res.redirect('/admin'); // Redirect to admin page after update
    } catch (error) {
        console.error('Error updating promotion:', error);
        res.status(500).send('Error updating promotion');
    }
});

// Route to update delivery
app.post('/update-delivery', async (req, res) => {
    const { id, status } = req.body;
    try {
        await Delivery.update({ Delivery_Status: status }, { where: { Delivery_ID: id } });
        res.redirect('/admin'); // Redirect to admin page after update
    } catch (error) {
        console.error('Error updating delivery:', error);
        res.status(500).send('Error updating delivery');
    }
});
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}/login`);
});