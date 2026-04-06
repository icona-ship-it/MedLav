-- Backfill module_id for existing cases based on role + type combination
-- Only updates cases where module_id is NULL (never overwrites)

-- Stragiudiziale cases → Perizia ML (category 1)
UPDATE cases SET module_id = 'perizia_ml_rc_civile', module_category = 1, pipeline_mode = 'full'
WHERE case_role = 'stragiudiziale' AND case_type = 'rc_auto' AND module_id IS NULL;

UPDATE cases SET module_id = 'perizia_ml_infortuni', module_category = 1, pipeline_mode = 'full'
WHERE case_role = 'stragiudiziale' AND case_type = 'infortuni' AND module_id IS NULL;

UPDATE cases SET module_id = 'perizia_ml_resp_prof', module_category = 1, pipeline_mode = 'full'
WHERE case_role = 'stragiudiziale' AND case_type IN ('generica', 'responsabilita_medica') AND module_id IS NULL;

UPDATE cases SET module_id = 'perizia_ml_malattia', module_category = 1, pipeline_mode = 'full'
WHERE case_role = 'stragiudiziale' AND case_type = 'previdenziale' AND module_id IS NULL;

-- Remaining stragiudiziale (any other type) → perizia_ml_resp_prof
UPDATE cases SET module_id = 'perizia_ml_resp_prof', module_category = 1, pipeline_mode = 'full'
WHERE case_role = 'stragiudiziale' AND module_id IS NULL;

-- CTU cases → CTU civile (category 2)
UPDATE cases SET module_id = 'ctu_civile_rc_civile', module_category = 2, pipeline_mode = 'full'
WHERE case_role = 'ctu' AND case_type = 'rc_auto' AND module_id IS NULL;

UPDATE cases SET module_id = 'ctu_civile_infortuni', module_category = 2, pipeline_mode = 'full'
WHERE case_role = 'ctu' AND case_type = 'infortuni' AND module_id IS NULL;

UPDATE cases SET module_id = 'ctu_civile_malattia', module_category = 2, pipeline_mode = 'full'
WHERE case_role = 'ctu' AND case_type = 'previdenziale' AND module_id IS NULL;

UPDATE cases SET module_id = 'ctu_civile_resp_prof', module_category = 2, pipeline_mode = 'full'
WHERE case_role = 'ctu' AND case_type IN ('generica', 'responsabilita_medica') AND module_id IS NULL;

-- Remaining CTU → ctu_civile_resp_prof
UPDATE cases SET module_id = 'ctu_civile_resp_prof', module_category = 2, pipeline_mode = 'full'
WHERE case_role = 'ctu' AND module_id IS NULL;

-- CTP cases → CTU civile (CTP merges into CTU with same sections)
UPDATE cases SET module_id = 'ctu_civile_rc_civile', module_category = 2, pipeline_mode = 'full'
WHERE case_role = 'ctp' AND case_type = 'rc_auto' AND module_id IS NULL;

UPDATE cases SET module_id = 'ctu_civile_resp_prof', module_category = 2, pipeline_mode = 'full'
WHERE case_role = 'ctp' AND module_id IS NULL;

-- Catch-all: any remaining cases without module_id
UPDATE cases SET module_id = 'perizia_ml_resp_prof', module_category = 1, pipeline_mode = 'full'
WHERE module_id IS NULL;
