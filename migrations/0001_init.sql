-- All rows below are deliberately fictional and intended for a public portfolio demo.
CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  item TEXT NOT NULL,
  sku TEXT NOT NULL,
  units INTEGER NOT NULL CHECK (units > 0),
  carrier TEXT NOT NULL,
  eta TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('in_transit','at_hub','delayed','delivered','ordered')),
  priority TEXT NOT NULL CHECK(priority IN ('critical','high','normal')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  sku TEXT NOT NULL,
  item TEXT NOT NULL,
  available INTEGER NOT NULL,
  reorder_point INTEGER NOT NULL,
  UNIQUE(site,sku)
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL UNIQUE REFERENCES shipments(id),
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','resolved')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL REFERENCES shipments(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scanned INTEGER NOT NULL,
  flagged INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id,id);
CREATE INDEX IF NOT EXISTS idx_alerts_state ON alerts(state);

INSERT OR IGNORE INTO shipments(id,origin,destination,item,sku,units,carrier,eta,status,priority) VALUES
 ('SHP-2401','Austin, TX','Toronto, CA','GPU accelerator tray','GPU-X80',12,'DHL Express',date('now','-3 days'),'delayed','critical'),
 ('SHP-2402','Taipei, TW','Frankfurt, DE','400G network switch','NET-400G',8,'FedEx Freight',date('now','+2 days'),'in_transit','high'),
 ('SHP-2403','San Jose, CA','Miami, US','NVMe storage module','STO-8TB',24,'UPS Supply Chain',date('now','-1 day'),'at_hub','high'),
 ('SHP-2404','Amsterdam, NL','London, UK','Server power supply','PWR-1600',40,'DHL Express',date('now','+5 days'),'in_transit','normal'),
 ('SHP-2405','Seoul, KR','Singapore, SG','DDR5 memory kits','MEM-128',64,'Kuehne+Nagel',date('now','+1 day'),'in_transit','high'),
 ('SHP-2406','Chicago, US','Toronto, CA','Fiber transceiver','OPT-400',36,'FedEx Freight',date('now','-5 days'),'delivered','normal'),
 ('SHP-2407','Portland, US','Ashburn, US','Compute chassis','CHS-2U',18,'UPS Supply Chain',date('now','-2 days'),'delayed','critical'),
 ('SHP-2408','Shenzhen, CN','Tokyo, JP','High-speed interconnect','NET-400G',20,'DHL Express',date('now','+4 days'),'ordered','normal'),
 ('SHP-2409','Paris, FR','Frankfurt, DE','GPU accelerator tray','GPU-X80',6,'FedEx Freight',date('now','+3 days'),'in_transit','normal'),
 ('SHP-2410','Dallas, US','Miami, US','Cooling pump assembly','COOL-5K',10,'DHL Express',date('now','+1 day'),'at_hub','critical'),
 ('SHP-2411','Montreal, CA','Toronto, CA','Rack power distribution','PDU-30',14,'UPS Supply Chain',date('now','+7 days'),'in_transit','normal'),
 ('SHP-2412','Boston, US','Ashburn, US','NVMe storage module','STO-8TB',32,'FedEx Freight',date('now','-4 days'),'delivered','normal');

INSERT OR IGNORE INTO inventory(site,sku,item,available,reorder_point) VALUES
 ('Toronto, CA','GPU-X80','GPU accelerator tray',2,10),
 ('Toronto, CA','PDU-30','Rack power distribution',22,12),
 ('Toronto, CA','OPT-400','Fiber transceiver',49,20),
 ('Frankfurt, DE','NET-400G','400G network switch',4,10),
 ('Frankfurt, DE','GPU-X80','GPU accelerator tray',28,8),
 ('Miami, US','STO-8TB','NVMe storage module',5,16),
 ('Miami, US','COOL-5K','Cooling pump assembly',1,5),
 ('Ashburn, US','CHS-2U','Compute chassis',3,9),
 ('Ashburn, US','STO-8TB','NVMe storage module',36,20),
 ('London, UK','PWR-1600','Server power supply',35,20),
 ('Singapore, SG','MEM-128','DDR5 memory kits',110,50),
 ('Tokyo, JP','NET-400G','400G network switch',22,10);
