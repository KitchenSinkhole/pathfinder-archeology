-- Custom SQL migration file, put your code below! --
CREATE VIEW "universe_type_attribute_effective" AS
SELECT
  ta."type_id"                     AS "type_id",
  ta."attribute_id"                AS "attr_id",
  COALESCE(ov."value", ta."value") AS "value"
FROM "universe_type_attribute" ta
LEFT JOIN "universe_type_override" ov
  ON ov."type_id" = ta."type_id"
 AND ov."attr_id" = ta."attribute_id"
UNION
SELECT
  ov."type_id" AS "type_id",
  ov."attr_id" AS "attr_id",
  ov."value"   AS "value"
FROM "universe_type_override" ov
WHERE NOT EXISTS (
  SELECT 1 FROM "universe_type_attribute" ta
  WHERE ta."type_id" = ov."type_id"
    AND ta."attribute_id" = ov."attr_id"
);
