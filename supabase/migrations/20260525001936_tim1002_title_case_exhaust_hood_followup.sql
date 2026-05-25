-- TIM-1002 follow-up: missed in the first sweep because of the embedded
-- "Type I" mixed-case fragment confusing the regex visual check.
update public.standard_equipment_reference set name_canonical = 'Commercial Exhaust Hood (Type I)' where name_canonical = 'commercial exhaust hood (Type I)';
