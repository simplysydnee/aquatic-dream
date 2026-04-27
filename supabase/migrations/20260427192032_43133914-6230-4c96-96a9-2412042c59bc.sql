CREATE POLICY "Admins can view email send log"
ON public.email_send_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));