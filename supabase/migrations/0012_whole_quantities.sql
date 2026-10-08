-- Antal skal være hele stk. – kun tidsenheder (timer) må være halve
alter table public.doc_lines add constraint doc_lines_whole_quantity
  check (quantity = round(quantity) or (lower(trim(unit)) in ('t', 't.', 'time', 'timer') and quantity * 2 = round(quantity * 2)));
