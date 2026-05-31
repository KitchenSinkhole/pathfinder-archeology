SELECT pg_notify(
  'map:' || ms.map_id,
  json_build_object(
    'task', 'systemNotification',
    'load', json_build_object(
      'mapId',    ms.map_id,
      'systemId', ms.system_id,
      'kind',     'killmail',
      'killmail', json_build_object(
        'killmailId', 999999,
        'shipTypeId', 670,
        'totalValue', 1500000000,
        'href',       'https://zkillboard.com/kill/999999/'
      )
    )
  )::text
)
FROM ap_map_system ms
JOIN ap_map m ON m.id = ms.map_id
WHERE ms.visible AND m.deleted_at IS NULL
ORDER BY random()
LIMIT 1;