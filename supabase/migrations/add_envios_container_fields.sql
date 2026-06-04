-- Envíos en espera de stock (container)
ALTER TABLE envios ADD COLUMN IF NOT EXISTS esperando_stock boolean DEFAULT false;
ALTER TABLE envios ADD COLUMN IF NOT EXISTS fecha_container date;
