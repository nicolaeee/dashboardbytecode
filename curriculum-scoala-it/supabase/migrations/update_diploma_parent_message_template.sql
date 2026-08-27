-- ============================================================================
--  MESAJ MAI AMPLU CATRE PARINTE (salut, scuze pentru intarziere, semnatura)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
--
--  Extinde random_diploma_parent_message (creata in add_urgent_tasks.sql, suprascrisa apoi
--  de add_virtual_coins_task.sql) - pastreaza cele 8 variante de continut celebrator,
--  randomizate ca inainte, dar le imbraca acum intr-un salut (Buna ziua/Buna seara, in functie
--  de ora locala Europa/Bucuresti la care se genereaza mesajul) si o incheiere unica, standard
--  (scuze pentru asteptare, mentiune explicita a diplomei atasate, semnatura echipei) - nu mai
--  repetata separat in fiecare varianta.
-- ============================================================================

create or replace function public.random_diploma_parent_message(p_first_name text, p_course_label text)
returns text language sql volatile as $$
  select
    (case when extract(hour from (now() at time zone 'Europe/Bucharest')) < 18
       then 'Bună ziua,' else 'Bună seara,' end)
    || E'\n\n' ||
    (array[
      format('🎉 Felicitări, %1$s! Suntem tare mândri de el pentru această reușită! A finalizat cu succes o nouă etapă din aventura lui la %2$s și ne bucurăm enorm să îl vedem cum evoluează, învață și prinde tot mai multă încredere. 🌟

Este o bucurie să îl avem alături de noi și abia așteptăm să vedem ce lucruri minunate va descoperi în continuare! 🚀', p_first_name, p_course_label),
      format('🌟 Vești minunate despre %1$s! A dus la capăt cu brio o nouă etapă din călătoria lui la %2$s. Suntem atât de mândri de progresul și determinarea lui! 🎉

Mulțumim că ne sunteți alături - abia așteptăm să vedem ce va cuceri în continuare! 💫', p_first_name, p_course_label),
      format('🚀 %1$s tocmai a bifat un nou pas important la %2$s! Ne umple de bucurie să îl vedem cum crește, învață lucruri noi și capătă din ce în ce mai multă încredere în el. 🎉

Suntem recunoscători că face parte din povestea noastră și abia așteptăm continuarea aventurii lui! 🌟', p_first_name, p_course_label),
      format('🎊 O reușită minunată pentru %1$s! A finalizat cu succes o nouă etapă la %2$s și e clar că progresul lui e uriaș. Suntem tare mândri de el! 🌈

Mulțumim că sunteți alături de noi în această călătorie - urmează lucruri și mai frumoase! ✨', p_first_name, p_course_label),
      format('🌈 Vești superbe despre %1$s! A trecut cu bine de o nouă etapă din aventura lui la %2$s, iar entuziasmul și implicarea lui ne bucură enorm. 🎉

Este o plăcere să îl vedem evoluând - abia așteptăm să vedem ce urmează! 🚀', p_first_name, p_course_label),
      format('✨ %1$s a mai făcut un pas mare înainte la %2$s! Suntem tare mândri de reușita lui și de tot progresul făcut până acum. 🎉

Vă mulțumim că sunteți alături de noi în această călătorie - urmează lucruri minunate! 🌟', p_first_name, p_course_label),
      format('🎉 Ce reușită frumoasă pentru %1$s! A încheiat cu succes o nouă etapă la %2$s și îl vedem din ce în ce mai încrezător și entuziasmat. 🌟

Ne bucurăm enorm să facem parte din parcursul lui - abia așteptăm continuarea! 🚀', p_first_name, p_course_label),
      format('🌟 Felicitări din suflet, %1$s! A dus la bun sfârșit o nouă etapă din aventura lui la %2$s, iar progresul lui ne umple de mândrie. 🎉

Mulțumim că sunteți alături de noi - urmează multe momente minunate! ✨', p_first_name, p_course_label)
    ])[1 + floor(random() * 8)::int]
    || E'\n\n' ||
    format('Ne cerem scuze pentru orice mic deranj cauzat de timpul de așteptare până la primirea acesteia - vă mulțumim pentru răbdare! 📎 Atașăm aici și diploma lui %1$s.

O zi minunată vă dorim, din partea întregii echipe ByteCode School! 💛', p_first_name);
$$;
