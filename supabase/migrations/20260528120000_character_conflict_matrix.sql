-- Migración: Matriz de Co-ocurrencia y Conflictos de Personajes para Algoritmo de Reparto
-- Calcula los intercambios de turnos directos y escenas compartidas entre personajes en PostgreSQL.

CREATE OR REPLACE FUNCTION public.get_character_conflict_matrix(p_script_id UUID)
RETURNS TABLE (
    char_a VARCHAR,
    char_b VARCHAR,
    shared_scenes_count BIGINT,
    direct_turn_exchanges BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH ordered_dialogues AS (
        SELECT 
            sl.scene_id,
            sl.line_order,
            c.name::VARCHAR AS character_name,
            LAG(c.name::VARCHAR) OVER (PARTITION BY sl.scene_id ORDER BY sl.line_order) AS prev_character
        FROM public.script_lines sl
        JOIN public.scenes sc ON sc.id = sl.scene_id
        JOIN public.characters c ON c.id = sl.character_id
        WHERE sc.script_id = p_script_id 
          AND c.name IS NOT NULL
          AND trim(sl.text) <> ''
    ),
    scene_pairs AS (
        SELECT DISTINCT a.scene_id, a.character_name AS c1, b.character_name AS c2
        FROM ordered_dialogues a
        JOIN ordered_dialogues b ON a.scene_id = b.scene_id AND a.character_name < b.character_name
    ),
    turn_pairs AS (
        SELECT 
            LEAST(character_name, prev_character) AS c1,
            GREATEST(character_name, prev_character) AS c2,
            COUNT(*) AS exchanges
        FROM ordered_dialogues
        WHERE prev_character IS NOT NULL AND character_name <> prev_character
        GROUP BY 1, 2
    )
    SELECT 
        sp.c1,
        sp.c2,
        COUNT(DISTINCT sp.scene_id)::BIGINT AS shared_scenes_count,
        COALESCE(MAX(tp.exchanges), 0)::BIGINT AS direct_turn_exchanges
    FROM scene_pairs sp
    LEFT JOIN turn_pairs tp ON sp.c1 = tp.c1 AND sp.c2 = tp.c2
    GROUP BY sp.c1, sp.c2;
END;
$$ LANGUAGE plpgsql STABLE;
