'use client';

import { useState, useEffect } from 'react';
import { mutate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import type { TeamCustomSkill } from '@/types/database';

const AGE_GROUPS = ['5-7', '8-10', '11-13', '14-18'] as const;

interface Props {
  teamId: string;
  coachId: string;
  /** Default age group (used when adding a brand-new skill). */
  defaultAgeGroup?: string;
  /** Categories already on the team's curriculum, suggested in the picker. */
  knownCategories: string[];
  /** Pre-fill for editing an existing custom skill. */
  existing?: TeamCustomSkill | null;
  /** Pre-select a category when adding from inside a category section. */
  defaultCategory?: string;
  onClose: () => void;
  onSaved: () => void;
}

function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 48);
}

function shortHash(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function CustomSkillSheet({
  teamId,
  coachId,
  defaultAgeGroup,
  knownCategories,
  existing,
  defaultCategory,
  onClose,
  onSaved,
}: Props) {
  const isEditing = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState(existing?.category ?? defaultCategory ?? '');
  const [ageGroups, setAgeGroups] = useState<string[]>(
    existing?.age_groups?.length
      ? existing.age_groups
      : defaultAgeGroup
      ? [defaultAgeGroup]
      : [],
  );
  const [introWeek, setIntroWeek] = useState<string>(
    existing?.intro_week != null ? String(existing.intro_week) : '',
  );
  const [teachingScript, setTeachingScript] = useState(existing?.teaching_script ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll while sheet is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function toggleAgeGroup(g: string) {
    setAgeGroups((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  }

  function validate(): string | null {
    if (!name.trim() || name.trim().length < 2) return 'Name must be at least 2 characters.';
    if (name.trim().length > 60) return 'Name must be 60 characters or fewer.';
    if (!category.trim()) return 'Category is required.';
    if (introWeek && (!/^\d+$/.test(introWeek) || +introWeek < 1 || +introWeek > 52))
      return 'Intro week must be between 1 and 52.';
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);

    try {
      if (isEditing && existing) {
        await mutate({
          table: 'team_custom_skills',
          operation: 'update',
          filters: { id: existing.id },
          data: {
            name: name.trim(),
            category: category.trim(),
            age_groups: ageGroups,
            intro_week: introWeek ? parseInt(introWeek, 10) : null,
            teaching_script: teachingScript.trim() || null,
          },
        });
        trackEvent('curriculum_custom_skill_edited', { skill_id: existing.skill_id });
      } else {
        const skill_id = `custom:${slug(name)}_${shortHash()}`;
        await mutate({
          table: 'team_custom_skills',
          operation: 'insert',
          data: {
            team_id: teamId,
            skill_id,
            name: name.trim(),
            category: category.trim(),
            age_groups: ageGroups,
            intro_week: introWeek ? parseInt(introWeek, 10) : null,
            teaching_script: teachingScript.trim() || null,
            created_by: coachId,
          },
        });
        trackEvent('curriculum_custom_skill_added', {
          category: category.trim(),
          has_intro_week: !!introWeek,
          age_group_count: ageGroups.length,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg bg-zinc-900 rounded-t-2xl sm:rounded-2xl border border-zinc-800 shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-10">
          <div>
            <h2 className="text-lg font-semibold">
              {isEditing ? 'Edit custom skill' : 'Add a custom skill'}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Track something the built-in curriculum doesn&apos;t cover.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors touch-manipulation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Skill name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pick-and-roll defense"
              maxLength={60}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Category</label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. defense, ball_handling, situational"
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              {knownCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-xs text-zinc-500">
              Pick from your existing categories or type a new one.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Age groups</label>
            <div className="flex flex-wrap gap-2">
              {AGE_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleAgeGroup(g)}
                  aria-pressed={ageGroups.includes(g)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors touch-manipulation ${
                    ageGroups.includes(g)
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">
              Intro week <span className="text-zinc-500">(optional)</span>
            </label>
            <Input
              type="number"
              min={1}
              max={52}
              value={introWeek}
              onChange={(e) => setIntroWeek(e.target.value)}
              placeholder="When does this skill enter the rotation?"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">
              Teaching script <span className="text-zinc-500">(optional)</span>
            </label>
            <Textarea
              value={teachingScript}
              onChange={(e) => setTeachingScript(e.target.value)}
              placeholder="The cue or phrase you'd say to the team — this shows up in plans and recap copy."
              rows={3}
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex gap-2 p-5 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-sm">
          <Button variant="ghost" onClick={onClose} disabled={saving} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? 'Save changes' : 'Add skill'}
          </Button>
        </div>
      </div>
    </div>
  );
}
