-- CNX AthletX Seed Data

-- Product Lines
INSERT INTO product_lines (name, slug, nutrition_json, ingredients, how_to_use) VALUES
(
    'Plant Protein',
    'plant-protein',
    '{"Serving Size":"30g (1 scoop)","Calories":"120","Protein":"25g","Carbohydrates":"3g","Fat":"1.5g","Fiber":"2g","Sodium":"150mg"}',
    'Pea protein isolate, brown rice protein concentrate, natural vanilla flavoring, coconut MCT powder, sea salt, stevia leaf extract.',
    'Mix one scoop (30g) with 250-300ml of cold water, plant milk, or your favorite smoothie. Shake or blend well. Best consumed within 30 minutes after training. Can also be added to oatmeal, pancakes, or baked goods.'
);

-- Products
INSERT INTO products (product_line_id, slug, name, description, price_thb, weight_g, image_url, active) VALUES
(
    (SELECT id FROM product_lines WHERE slug = 'plant-protein'),
    'plant-protein-500g',
    'CNX Plant Protein 500g',
    'Premium pea and brown rice protein blend. 25g protein per serving. Made for athletes who care about what they put in their bodies. Neutral flavor, mixes smooth. Grown and produced in Thailand.',
    89900,
    500,
    '/images/products/plant-protein-500g.jpg',
    1
),
(
    (SELECT id FROM product_lines WHERE slug = 'plant-protein'),
    'plant-protein-1000g',
    'CNX Plant Protein 1kg',
    'Premium pea and brown rice protein blend. 25g protein per serving. Made for athletes who care about what they put in their bodies. Neutral flavor, mixes smooth. Grown and produced in Thailand. Better value for regular users.',
    159900,
    1000,
    '/images/products/plant-protein-1000g.jpg',
    1
);

-- Inventory
INSERT INTO inventory (product_id, stock_count, reserved_count) VALUES
((SELECT id FROM products WHERE slug = 'plant-protein-500g'), 100, 0),
((SELECT id FROM products WHERE slug = 'plant-protein-1000g'), 100, 0);

-- Site settings
INSERT INTO site_settings (key, value) VALUES
('shipping_flat_rate', '10000'),
('shipping_free_threshold', '0'),
('promptpay_number', '0812345678'),
('bank_name', 'Kasikorn Bank'),
('bank_account_name', 'CNX AthletX Co., Ltd.'),
('bank_account_number', '123-4-56789-0'),
('payment_deadline_hours', '24');
