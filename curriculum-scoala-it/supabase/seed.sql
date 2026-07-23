-- Date demonstrative (optional). Ruleaza dupa schema.sql.
with p as (
  insert into public.platforms (name, description, accent, position) values
    ('Delightex',      'Lumi 3D si creativitate vizuala pentru incepatori', '#F2564B', 0),
    ('Blocuri de cod', 'Programare vizuala, logica de baza',                '#F2A93B', 1),
    ('Python',         'Primul limbaj scris, text-based',                   '#12A594', 2),
    ('Roblox Studio',  'Jocuri si scripting in Lua',                        '#D6409F', 3),
    ('Unity',          'Motor de joc 3D, C#',                               '#7C5CFF', 4)
  returning id, name
), c as (
  insert into public.courses (platform_id, title, description, position)
  select p.id, 'Alfabetizare / Primii pasi in lumi 3D', 'Cursul introductiv', 0 from p where p.name = 'Delightex'
  returning id
), m as (
  insert into public.modules (course_id, title, description, position)
  select c.id, 'Modulul 1 / Orientare in spatiu 3D', 'Camera, axe, obiecte', 0 from c
  returning id
)
insert into public.lessons (module_id, title, objective, video_url, notes, homework, position)
select m.id,
       'Lectia 1: Primul meu proiect',
       'Copilul creeaza un proiect nou, salveaza si recunoaste axele X, Y, Z.',
       'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
       'Verifica la inceput ca fiecare copil are cont si proiectul salvat.',
       'Adauga inca doua obiecte in scena si trimite linkul proiectului.',
       0
from m;
