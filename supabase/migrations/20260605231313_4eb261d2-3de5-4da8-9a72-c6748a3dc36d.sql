UPDATE public.marketing_campaigns
SET from_address = 'Aquatic Dreams <info@aquaticdreamsswim.com>',
    reply_to = 'sutton@aquaticdreams.com',
    status = 'draft',
    failed_count = 0,
    sent_count = 0,
    sent_at = NULL,
    error = NULL
WHERE id = 'd1a373a5-2b75-4c40-bfaa-bddb2705030d';

DELETE FROM public.marketing_campaign_recipients
WHERE campaign_id = 'd1a373a5-2b75-4c40-bfaa-bddb2705030d';