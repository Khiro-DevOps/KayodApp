-- Migration: add industry and job_category columns to job_postings
-- Run this in Supabase SQL editor if your live database schema is out of sync.

alter table job_postings
  add column if not exists industry text;

alter table job_postings
  add column if not exists job_category text;
