-- Correct the Calculus course identity after discovering the initial code was entered as M211.
-- Keep the course name separate from the code so UI layers can compose them without duplication.

update public.courses
set code = 'M215',
    name = 'ACP Calculus I'
where code = 'M211'
  and name in ('ACP Calculus I M211', 'ACP Calculus I');
