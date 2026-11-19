-- Run last, after Q2 is verified and no anonymous code reads job_postings.
REVOKE SELECT ON public.job_postings FROM anon;
