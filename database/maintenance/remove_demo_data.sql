BEGIN;

DELETE FROM hotels
WHERE slug IN (
  'rs-exclusive-heritage',
  'rs-exclusive-lakeside',
  'rs-exclusive-business'
)
OR subdomain IN ('hotelone', 'hoteltwo', 'hotelthree');

COMMIT;
