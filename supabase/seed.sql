-- Triton Board — seed data (your current plan as of 2026-07-02).
-- Run AFTER schema.sql. Run once on a fresh project; re-running will duplicate rows.

-- Team roster
insert into members (name, initials, position) values
  ('Eason',  'E', 0),
  ('Zahra',  'Z', 1),
  ('Bruce',  'B', 2),
  ('Harish', 'H', 3);

-- Modules (SFT -> RL pipeline; Harness + Skills as cross-cutting foundations)
insert into modules (name, kind, objective, position) values
  ('SFT',                 'pipeline',   'Distill agentic SFT trajectories from a large model and SFT Qwen3.6.',                                    0),
  ('RL',                  'pipeline',   'RL training of the agentic system.',                                                                      1),
  ('Harness Development', 'foundation', 'Build a harness usable for both RL training and SFT trajectory distillation, with tool & skills calling.', 0),
  ('Skills Refinement',   'foundation', 'Evaluate the effectiveness of HQ skills, capture success / failure patterns, and keep making them better.', 1);

-- Tasks, joined onto their module by name
insert into tasks (module_id, title, status, assignees, position)
select m.id, t.title, t.status, t.assignees, t.position
from (values
  ('SFT',                 'GLM + CC evaluation',          'in_progress', array['Bruce'],           0),
  ('SFT',                 'SFT data processing',          'in_progress', array['Harish'],          1),
  ('Harness Development', 'Automated harness evaluation', 'in_progress', array['Eason', 'Zahra'],  0)
) as t(module_name, title, status, assignees, position)
join modules m on m.name = t.module_name;
