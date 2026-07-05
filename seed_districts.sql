-- =============================================================
-- Kisan Alert — Pan-India Districts Seed Script
-- Run this in the Supabase SQL Editor to populate the districts table.
-- =============================================================

-- Clean insertions with pre-generated UUIDs to prevent duplication on multiple runs.
-- This script only INSERTS rows and does NOT modify the schema or existing data.

INSERT INTO districts (id, name, state, latitude, longitude) VALUES
-- Punjab
('d01b1b01-8b2b-4c0a-9d0a-111111111111', 'Amritsar', 'Punjab', 31.6340, 74.8723),
('d01b1b02-8b2b-4c0a-9d0a-222222222222', 'Ludhiana', 'Punjab', 30.9010, 75.8573),
('d01b1b03-8b2b-4c0a-9d0a-333333333333', 'Jalandhar', 'Punjab', 31.3260, 75.5762),
('d01b1b04-8b2b-4c0a-9d0a-444444444444', 'Patiala', 'Punjab', 30.3398, 76.3869),
('d01b1b05-8b2b-4c0a-9d0a-555555555555', 'Bathinda', 'Punjab', 30.2110, 74.9455),

-- Uttar Pradesh
('d02b2b01-8b2b-4c0a-9d0b-111111111111', 'Lucknow', 'Uttar Pradesh', 26.8467, 80.9462),
('d02b2b02-8b2b-4c0a-9d0b-222222222222', 'Kanpur', 'Uttar Pradesh', 26.4499, 80.3319),
('d02b2b03-8b2b-4c0a-9d0b-333333333333', 'Varanasi', 'Uttar Pradesh', 25.3176, 82.9739),
('d02b2b04-8b2b-4c0a-9d0b-444444444444', 'Prayagraj', 'Uttar Pradesh', 25.4358, 81.8463),
('d02b2b05-8b2b-4c0a-9d0b-555555555555', 'Meerut', 'Uttar Pradesh', 28.9845, 77.7064),
('d02b2b06-8b2b-4c0a-9d0b-666666666666', 'Agra', 'Uttar Pradesh', 27.1767, 78.0081),

-- Gujarat
('d03b3b01-8b2b-4c0a-9d0c-111111111111', 'Ahmedabad', 'Gujarat', 23.0225, 72.5714),
('d03b3b02-8b2b-4c0a-9d0c-222222222222', 'Surat', 'Gujarat', 21.1702, 72.8311),
('d03b3b03-8b2b-4c0a-9d0c-333333333333', 'Vadodara', 'Gujarat', 22.3072, 73.1812),
('d03b3b04-8b2b-4c0a-9d0c-444444444444', 'Rajkot', 'Gujarat', 22.3039, 70.8022),
('d03b3b05-8b2b-4c0a-9d0c-555555555555', 'Mehsana', 'Gujarat', 23.6000, 72.4000),

-- Rajasthan
('d04b4b01-8b2b-4c0a-9d0d-111111111111', 'Jaipur', 'Rajasthan', 26.9124, 75.7873),
('d04b4b02-8b2b-4c0a-9d0d-222222222222', 'Jodhpur', 'Rajasthan', 26.2389, 73.0243),
('d04b4b03-8b2b-4c0a-9d0d-333333333333', 'Udaipur', 'Rajasthan', 24.5854, 73.7125),
('d04b4b04-8b2b-4c0a-9d0d-444444444444', 'Kota', 'Rajasthan', 25.2138, 75.8648),
('d04b4b05-8b2b-4c0a-9d0d-555555555555', 'Bikaner', 'Rajasthan', 28.0194, 73.3134),

-- Karnataka
('d05b5b01-8b2b-4c0a-9d0e-111111111111', 'Bengaluru', 'Karnataka', 12.9716, 77.5946),
('d05b5b02-8b2b-4c0a-9d0e-222222222222', 'Mysuru', 'Karnataka', 12.2958, 76.6394),
('d05b5b03-8b2b-4c0a-9d0e-333333333333', 'Dharwad', 'Karnataka', 15.3647, 75.1240),
('d05b5b04-8b2b-4c0a-9d0e-444444444444', 'Mangaluru', 'Karnataka', 12.9141, 74.8560),
('d05b5b05-8b2b-4c0a-9d0e-555555555555', 'Belagavi', 'Karnataka', 15.8497, 74.4977),

-- Andhra Pradesh
('d06b6b01-8b2b-4c0a-9d0f-111111111111', 'Visakhapatnam', 'Andhra Pradesh', 17.6868, 83.2185),
('d06b6b02-8b2b-4c0a-9d0f-222222222222', 'Vijayawada', 'Andhra Pradesh', 16.5062, 80.6480),
('d06b6b03-8b2b-4c0a-9d0f-333333333333', 'Guntur', 'Andhra Pradesh', 16.3067, 80.4365),
('d06b6b04-8b2b-4c0a-9d0f-444444444444', 'Kurnool', 'Andhra Pradesh', 15.8281, 78.0373),
('d06b6b05-8b2b-4c0a-9d0f-555555555555', 'Tirupati', 'Andhra Pradesh', 13.6288, 79.4192),

-- Tamil Nadu
('d07b7b01-8b2b-4c0a-9d1a-111111111111', 'Chennai', 'Tamil Nadu', 13.0827, 80.2707),
('d07b7b02-8b2b-4c0a-9d1a-222222222222', 'Coimbatore', 'Tamil Nadu', 11.0168, 76.9558),
('d07b7b03-8b2b-4c0a-9d1a-333333333333', 'Madurai', 'Tamil Nadu', 9.9252, 78.1198),
('d07b7b04-8b2b-4c0a-9d1a-444444444444', 'Tiruchirappalli', 'Tamil Nadu', 10.7905, 78.7047),
('d07b7b05-8b2b-4c0a-9d1a-555555555555', 'Salem', 'Tamil Nadu', 11.6643, 78.1460),

-- West Bengal
('d08b8b01-8b2b-4c0a-9d1b-111111111111', 'Kolkata', 'West Bengal', 22.5726, 88.3639),
('d08b8b02-8b2b-4c0a-9d1b-222222222222', 'Darjeeling', 'West Bengal', 27.0410, 88.2627),
('d08b8b03-8b2b-4c0a-9d1b-333333333333', 'Siliguri', 'West Bengal', 26.7271, 88.3953),
('d08b8b04-8b2b-4c0a-9d1b-444444444444', 'Bardhaman', 'West Bengal', 23.2324, 87.8630),
('d08b8b05-8b2b-4c0a-9d1b-555555555555', 'Murshidabad', 'West Bengal', 24.1750, 88.2804),

-- Odisha
('d09b9b01-8b2b-4c0a-9d1c-111111111111', 'Bhubaneswar', 'Odisha', 20.2961, 85.8245),
('d09b9b02-8b2b-4c0a-9d1c-222222222222', 'Cuttack', 'Odisha', 20.4625, 85.8830),
('d09b9b03-8b2b-4c0a-9d1c-333333333333', 'Rourkela', 'Odisha', 22.2604, 84.8536),
('d09b9b04-8b2b-4c0a-9d1c-444444444444', 'Sambalpur', 'Odisha', 21.4669, 83.9812),
('d09b9b05-8b2b-4c0a-9d1c-555555555555', 'Puri', 'Odisha', 19.8135, 85.8312),

-- Madhya Pradesh
('d10b1001-8b2b-4c0a-9d1d-111111111111', 'Bhopal', 'Madhya Pradesh', 23.2599, 77.4126),
('d10b1002-8b2b-4c0a-9d1d-222222222222', 'Indore', 'Madhya Pradesh', 22.7196, 75.8577),
('d10b1003-8b2b-4c0a-9d1d-333333333333', 'Gwalior', 'Madhya Pradesh', 26.2183, 78.1828),
('d10b1004-8b2b-4c0a-9d1d-444444444444', 'Jabalpur', 'Madhya Pradesh', 23.1815, 79.9864),
('d10b1005-8b2b-4c0a-9d1d-555555555555', 'Ujjain', 'Madhya Pradesh', 23.1760, 75.7885),

-- Maharashtra (black-cotton soil belt; powers the "Black Soil — Pune" demo preset)
('d11b1101-8b2b-4c0a-9d1e-111111111111', 'Pune', 'Maharashtra', 18.5204, 73.8567),
('d11b1102-8b2b-4c0a-9d1e-222222222222', 'Nagpur', 'Maharashtra', 21.1458, 79.0882),
('d11b1103-8b2b-4c0a-9d1e-333333333333', 'Nashik', 'Maharashtra', 19.9975, 73.7898),
('d11b1104-8b2b-4c0a-9d1e-444444444444', 'Aurangabad', 'Maharashtra', 19.8762, 75.3433),
('d11b1105-8b2b-4c0a-9d1e-555555555555', 'Solapur', 'Maharashtra', 17.6599, 75.9064)
ON CONFLICT (id) DO NOTHING;

-- Recommended database indices for query scaling
CREATE INDEX IF NOT EXISTS idx_districts_state ON districts(state);
CREATE INDEX IF NOT EXISTS idx_districts_name ON districts(name);
