-- Set the organization for mutaaf.aziz@gmail.com to organization tier
UPDATE organizations SET tier = 'organization'
WHERE id = (SELECT org_id FROM coaches WHERE email = 'mutaaf.aziz@gmail.com' LIMIT 1);
