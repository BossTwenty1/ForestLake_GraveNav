-- PostgREST resolves the public memorial view's plot-reference expression too.
-- This immutable helper only formats the existing public-safe reference.
begin;

grant execute on function public.project_sample_plot_reference(text, text, text)
  to service_role;

commit;
