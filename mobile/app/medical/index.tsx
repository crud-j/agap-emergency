import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScreenHeader } from '../../src/components/ui/screen-header';
// Reporter map icon lives on this screen but is account data (users.sex), not
// medical data — it is shown in every state, including before medical consent.
import { MapIconCard } from '../../src/components/profile/map-icon-card';
import { checkConsent, MEDICAL_CONSENT_TYPE } from '../../src/services/api/consent.api';
import { ApiError } from '../../src/services/api/http';
import {
  getMyMedicalProfile,
  createMedicalProfile,
  updateMedicalProfile,
  type MedicalProfile,
  type MedicalProfileDto,
} from '../../src/services/api/medical.api';

// ─── Constants ───────────────────────────────────────────────────────────────

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const STANDARD_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
// Limits mirror the backend DTO; blood_type is VarChar(5).
const BLOOD_TYPE_MAX_LENGTH = 5;
const ITEM_MAX_LENGTH = 60;
const LIST_MAX_ITEMS = 20;
const NOTES_MAX_LENGTH = 500;
const REVIEW_AFTER_DAYS = 180;

type ListKey = 'allergies' | 'medical_conditions' | 'current_medications' | 'disabilities';

interface ListSection {
  key: ListKey;
  title: string;
  icon: IconName;
  help: string;
  placeholder: string;
  suggestions: string[];
  critical?: boolean;
}

const LIST_SECTIONS: ListSection[] = [
  {
    key: 'allergies',
    title: 'Allergies',
    icon: 'warning-outline',
    help: 'Medicines, foods, or materials that cause a reaction.',
    placeholder: 'e.g. Penicillin',
    suggestions: ['Penicillin', 'Aspirin', 'Sulfa drugs', 'Latex', 'Peanuts', 'Shellfish', 'Insect stings'],
    critical: true,
  },
  {
    key: 'medical_conditions',
    title: 'Medical Conditions',
    icon: 'fitness-outline',
    help: 'Ongoing conditions responders should know about.',
    placeholder: 'e.g. Asthma',
    suggestions: ['Asthma', 'Diabetes', 'Hypertension', 'Heart disease', 'Epilepsy', 'Kidney disease', 'Pregnant'],
  },
  {
    key: 'current_medications',
    title: 'Current Medications',
    icon: 'medkit-outline',
    help: 'Include the dose if you know it.',
    placeholder: 'e.g. Metformin 500 mg',
    suggestions: ['Insulin', 'Asthma inhaler', 'Blood thinner', 'Blood pressure medicine'],
  },
  {
    key: 'disabilities',
    title: 'Disabilities & Accessibility',
    icon: 'accessibility-outline',
    help: 'Needs that affect how responders should help or move you.',
    placeholder: 'e.g. Uses a wheelchair',
    suggestions: ['Wheelchair user', 'Deaf or hard of hearing', 'Blind or low vision', 'Speech difficulty', 'Cognitive disability'],
  },
];

const COMPLETENESS_TOTAL = LIST_SECTIONS.length + 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface FormValues {
  bloodType: string;
  lists: Record<ListKey, string[]>;
  notes: string;
}

function valuesFromProfile(profile: MedicalProfile | null): FormValues {
  return {
    bloodType: profile?.blood_type ?? '',
    lists: {
      allergies: profile?.allergies ?? [],
      medical_conditions: profile?.medical_conditions ?? [],
      current_medications: profile?.current_medications ?? [],
      disabilities: profile?.disabilities ?? [],
    },
    notes: profile?.responder_notes ?? '',
  };
}

// Blank or "Unknown" clears the stored value; sending undefined would leave the old one in place.
function normalizeBloodType(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return normalized === '' || normalized === 'UNKNOWN' ? null : normalized;
}

function toDto(values: FormValues): MedicalProfileDto {
  return {
    bloodType: normalizeBloodType(values.bloodType),
    allergies: values.lists.allergies,
    medicalConditions: values.lists.medical_conditions,
    currentMedications: values.lists.current_medications,
    disabilities: values.lists.disabilities,
    responderNotes: values.notes.trim() || null,
  };
}

function cleanItem(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, ITEM_MAX_LENGTH);
}

function includesIgnoreCase(items: string[], value: string): boolean {
  return items.some((item) => item.toLowerCase() === value.toLowerCase());
}

function countFilled(profile: MedicalProfile): number {
  return (
    (profile.blood_type ? 1 : 0) +
    LIST_SECTIONS.filter((section) => profile[section.key].length > 0).length +
    (profile.responder_notes ? 1 : 0)
  );
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function MedicalScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const consent = useQuery({
    queryKey: ['consent', MEDICAL_CONSENT_TYPE],
    queryFn: () => checkConsent(MEDICAL_CONSENT_TYPE),
  });

  const granted = consent.data?.granted ?? false;

  const profileQuery = useQuery({
    queryKey: ['medical-profile'],
    queryFn: getMyMedicalProfile,
    enabled: granted,
    retry: false,
  });

  const notFound = profileQuery.error instanceof ApiError && profileQuery.error.status === 404;
  const exists = !profileQuery.isError && !!profileQuery.data;

  if (consent.isLoading) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Medical Profile" />
        <View style={styles.center}>
          <ActivityIndicator color="#0D6053" size="large" />
        </View>
      </View>
    );
  }

  if (!granted) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Medical Profile" />
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Ionicons name="pulse-outline" size={40} color="#0D6053" />
          </View>
          <Text style={styles.title}>Medical Profile</Text>
          <Text style={styles.desc}>
            Store optional medical info that responders can view in an emergency — with your consent.
          </Text>
          <View style={styles.gate}>
            <Ionicons name="lock-closed" size={18} color="#B45309" />
            <Text style={styles.gateText}>
              Grant medical data consent so responders can view this in an emergency.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => router.push('/profile/privacy')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Manage Consent</Text>
          </TouchableOpacity>
          <View style={styles.gateMapIcon}>
            <MapIconCard />
          </View>
        </View>
      </View>
    );
  }

  if (profileQuery.isError && !notFound) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Medical Profile" />
        <View style={styles.center}>
          <View style={[styles.iconWrap, { backgroundColor: '#FEF3F2' }]}>
            <Ionicons name="cloud-offline-outline" size={38} color="#B42318" />
          </View>
          <Text style={styles.title}>Couldn't load your profile</Text>
          <Text style={styles.desc}>Check your connection and try again.</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => profileQuery.refetch()}
            activeOpacity={0.85}
            disabled={profileQuery.isFetching}
          >
            {profileQuery.isFetching
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.btnText}>Try Again</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Medical Profile" />
      {profileQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0D6053" size="large" />
        </View>
      ) : (
        <ProfileForm
          profile={profileQuery.data ?? null}
          exists={exists}
          onSaved={(profile) => qc.setQueryData(['medical-profile'], profile)}
        />
      )}
    </View>
  );
}

function ProfileForm({
  profile,
  exists,
  onSaved,
}: {
  profile: MedicalProfile | null;
  exists: boolean;
  onSaved: (profile: MedicalProfile) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!exists);

  if (!editing && profile) {
    return <ProfileSummary profile={profile} onEdit={() => setEditing(true)} />;
  }

  return (
    <ProfileEditor
      profile={profile}
      exists={exists}
      onSaved={onSaved}
      onDone={(saved) => (saved ? setEditing(false) : router.back())}
    />
  );
}

// ─── Summary (read mode) ─────────────────────────────────────────────────────

function ProfileSummary({ profile, onEdit }: { profile: MedicalProfile; onEdit: () => void }) {
  const router = useRouter();
  const filled = countFilled(profile);
  const reviewedAt = profile.last_reviewed_at ?? profile.updated_at;
  const needsReview = daysSince(reviewedAt) > REVIEW_AFTER_DAYS;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View
            style={styles.bloodBadge}
            accessible
            accessibilityLabel={`Blood type ${profile.blood_type ?? 'not recorded'}`}
          >
            <Ionicons name="water" size={14} color="#B42318" />
            <Text style={[styles.bloodBadgeText, !profile.blood_type && styles.bloodBadgeUnknown]}>
              {profile.blood_type ?? '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>Blood type</Text>
            <Text style={styles.heroValue}>{profile.blood_type ?? 'Not recorded'}</Text>
            <View style={styles.sharingChip}>
              <Ionicons name="shield-checkmark" size={12} color="#0D6053" />
              <Text style={styles.sharingText}>Sharing with responders</Text>
            </View>
          </View>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.progressHead}>
          <Text style={styles.progressLabel}>Profile completeness</Text>
          <Text style={styles.progressValue}>{filled} of {COMPLETENESS_TOTAL}</Text>
        </View>
        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: COMPLETENESS_TOTAL, now: filled }}
        >
          <View style={[styles.progressFill, { width: `${(filled / COMPLETENESS_TOTAL) * 100}%` }]} />
        </View>
        <Text style={styles.heroMeta}>Last reviewed {formatDate(reviewedAt)}</Text>
      </View>

      <MapIconCard />

      {needsReview && (
        <TouchableOpacity style={styles.reviewNudge} onPress={onEdit} activeOpacity={0.85} accessibilityRole="button">
          <Ionicons name="refresh-circle-outline" size={20} color="#A15C08" />
          <Text style={styles.reviewNudgeText}>
            It's been over 6 months since you reviewed this. Check that it's still accurate.
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#A15C08" />
        </TouchableOpacity>
      )}

      {LIST_SECTIONS.map((section) => {
        const items = profile[section.key];
        const alert = section.critical && items.length > 0;
        return (
          <View key={section.key} style={[styles.card, alert && styles.cardAlert]}>
            <SectionHeading icon={section.icon} title={section.title} tone={alert ? 'alert' : 'default'} count={items.length} />
            {items.length > 0 ? (
              <View style={styles.chipWrap}>
                {items.map((item, index) => (
                  <View key={`${item}-${index}`} style={[styles.readChip, alert && styles.readChipAlert]}>
                    <Text style={[styles.readChipText, alert && styles.readChipTextAlert]}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyRow onAdd={onEdit} label={section.title} />
            )}
          </View>
        );
      })}

      <View style={styles.card}>
        <SectionHeading icon="document-text-outline" title="Notes for Responders" />
        {profile.responder_notes ? (
          <Text style={styles.notesText}>{profile.responder_notes}</Text>
        ) : (
          <EmptyRow onAdd={onEdit} label="Notes for Responders" />
        )}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onEdit} activeOpacity={0.85} accessibilityRole="button">
        <Ionicons name="create-outline" size={18} color="#FFFFFF" />
        <Text style={styles.primaryBtnText}>Edit Medical Profile</Text>
      </TouchableOpacity>

      <View style={styles.privacyNote}>
        <Ionicons name="lock-closed-outline" size={14} color="#6B7280" />
        <Text style={styles.privacyText}>
          Shown only to authorized responders during an emergency. Every access is logged.{' '}
          <Text style={styles.link} onPress={() => router.push('/profile/privacy')} accessibilityRole="link">
            View access log
          </Text>
        </Text>
      </View>
    </ScrollView>
  );
}

function SectionHeading({
  icon,
  title,
  help,
  tone = 'default',
  count,
}: {
  icon: IconName;
  title: string;
  help?: string;
  tone?: 'default' | 'alert';
  count?: number;
}) {
  const alert = tone === 'alert';
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionIcon, alert && styles.sectionIconAlert]}>
        <Ionicons name={icon} size={18} color={alert ? '#B42318' : '#0D6053'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, alert && styles.sectionTitleAlert]} accessibilityRole="header">
          {title}
        </Text>
        {help ? <Text style={styles.sectionHelp}>{help}</Text> : null}
      </View>
      {count ? (
        <View style={[styles.countPill, alert && styles.countPillAlert]}>
          <Text style={[styles.countText, alert && styles.countTextAlert]}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function EmptyRow({ onAdd, label }: { onAdd: () => void; label: string }) {
  return (
    <View style={styles.emptyRow}>
      <Text style={styles.emptyText}>None added</Text>
      <TouchableOpacity onPress={onAdd} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Add ${label}`}>
        <Text style={styles.link}>Add</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function ProfileEditor({
  profile,
  exists,
  onSaved,
  onDone,
}: {
  profile: MedicalProfile | null;
  exists: boolean;
  onSaved: (profile: MedicalProfile) => void;
  onDone: (saved: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState(() => valuesFromProfile(profile));
  const [dirty, setDirty] = useState(false);
  // Tracked in state (not mutation.isPending) so it flips in the same render as `dirty`.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [closeRequested, setCloseRequested] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (dto: MedicalProfileDto) => (exists ? updateMedicalProfile(dto) : createMedicalProfile(dto)),
    onSuccess: (savedProfile) => {
      onSaved(savedProfile);
      setSavedAt(new Date());
    },
    onError: (err: Error) => {
      setSaveError(err.message);
      setDirty(true);
      setCloseRequested(false);
    },
    onSettled: () => setSaving(false),
  });

  useEffect(() => {
    if (!dirty || saving || saveError) return undefined;
    const timer = setTimeout(() => {
      setDirty(false);
      setSaving(true);
      saveMutation.mutate(toDto(values));
    }, closeRequested ? 0 : 900);
    return () => clearTimeout(timer);
  }, [values, dirty, saving, saveError, closeRequested]);

  useEffect(() => {
    if (!closeRequested || dirty || saving || saveError) return;
    setCloseRequested(false);
    onDone(exists);
  }, [closeRequested, dirty, saving, saveError, exists]);

  // Best-effort flush if the user leaves with the back button inside the debounce window.
  const latest = useRef({ values, dirty, exists, onSaved });
  latest.current = { values, dirty, exists, onSaved };
  useEffect(() => () => {
    const pending = latest.current;
    if (!pending.dirty) return;
    const dto = toDto(pending.values);
    (pending.exists ? updateMedicalProfile(dto) : createMedicalProfile(dto))
      .then(pending.onSaved)
      .catch(() => undefined);
  }, []);

  function change(patch: Partial<FormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setDirty(true);
    setSaveError('');
  }

  function changeList(key: ListKey, items: string[]) {
    setValues((current) => ({ ...current, lists: { ...current.lists, [key]: items } }));
    setDirty(true);
    setSaveError('');
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!exists ? (
          <View style={styles.introCard}>
            <Ionicons name="heart-circle-outline" size={28} color="#0D6053" />
            <View style={{ flex: 1 }}>
              <Text style={styles.introTitle}>Your emergency medical card</Text>
              <Text style={styles.introText}>
                Every field is optional. Add what you know — responders see it only during an emergency.
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.editNote}>Changes save automatically as you go.</Text>
        )}

        <MapIconCard />

        <View style={styles.card}>
          <SectionHeading
            icon="water-outline"
            title="Blood Type"
            help="Check your donor card or lab results. If unsure, choose Not sure — a wrong value is worse than none."
          />
          <BloodTypePicker value={values.bloodType} onChange={(bloodType) => change({ bloodType })} />
        </View>

        {LIST_SECTIONS.map((section) => (
          <ListField
            key={section.key}
            section={section}
            items={values.lists[section.key]}
            onChange={(items) => changeList(section.key, items)}
          />
        ))}

        <View style={styles.card}>
          <SectionHeading
            icon="document-text-outline"
            title="Notes for Responders"
            help="Anything else that helps, e.g. pacemaker, hearing aids, preferred language."
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add a short note for first responders"
            placeholderTextColor="#9CA3AF"
            value={values.notes}
            onChangeText={(notes) => change({ notes })}
            multiline
            maxLength={NOTES_MAX_LENGTH}
            textAlignVertical="top"
            accessibilityLabel="Notes for responders"
          />
          <Text style={styles.counter}>{values.notes.length}/{NOTES_MAX_LENGTH}</Text>
        </View>

        {saveError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#B42318" />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Your latest changes weren't saved</Text>
              <Text style={styles.errorText}>{saveError}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => setSaveError('')}
                accessibilityRole="button"
              >
                <Text style={styles.link}>Retry save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <SaveStatus saving={saving} dirty={dirty} error={!!saveError} savedAt={savedAt} />
        <TouchableOpacity
          style={[styles.doneBtn, closeRequested && styles.doneBtnBusy]}
          onPress={() => setCloseRequested(true)}
          disabled={closeRequested}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Done editing"
        >
          {closeRequested
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={styles.doneBtnText}>Done</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function SaveStatus({
  saving,
  dirty,
  error,
  savedAt,
}: {
  saving: boolean;
  dirty: boolean;
  error: boolean;
  savedAt: Date | null;
}) {
  let icon: IconName = 'cloud-done-outline';
  let color = '#71817A';
  let text = 'Changes save automatically';
  if (error) {
    icon = 'alert-circle-outline';
    color = '#B42318';
    text = 'Not saved';
  } else if (saving) {
    icon = 'sync-outline';
    color = '#0D6053';
    text = 'Saving…';
  } else if (dirty) {
    icon = 'time-outline';
    color = '#A15C08';
    text = 'Unsaved changes';
  } else if (savedAt) {
    icon = 'checkmark-circle';
    color = '#0D6053';
    text = `Saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  return (
    <View style={styles.saveStatus} accessibilityLiveRegion="polite">
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.saveStatusText, { color }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function BloodTypePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const normalized = value.trim().toUpperCase();
  const isUnknown = normalized === '' || normalized === 'UNKNOWN';
  const isStandard = STANDARD_BLOOD_TYPES.includes(normalized);
  const [otherOpen, setOtherOpen] = useState(!isStandard && !isUnknown);

  function pick(next: string) {
    setOtherOpen(false);
    onChange(next);
  }

  return (
    <View>
      <View style={styles.bloodGrid}>
        {STANDARD_BLOOD_TYPES.map((type) => {
          const selected = !otherOpen && normalized === type;
          return (
            <TouchableOpacity
              key={type}
              style={[styles.bloodChip, selected && styles.bloodChipSelected]}
              onPress={() => pick(type)}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Blood type ${type}`}
            >
              <Text style={[styles.bloodChipText, selected && styles.bloodChipTextSelected]}>{type}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.bloodExtraRow}>
        <TouchableOpacity
          style={[styles.bloodChip, styles.bloodChipWide, !otherOpen && isUnknown && styles.bloodChipSelected]}
          onPress={() => pick('')}
          activeOpacity={0.8}
          accessibilityRole="radio"
          accessibilityState={{ selected: !otherOpen && isUnknown }}
        >
          <Text style={[styles.bloodChipText, !otherOpen && isUnknown && styles.bloodChipTextSelected]}>Not sure</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bloodChip, styles.bloodChipWide, otherOpen && styles.bloodChipSelected]}
          onPress={() => {
            setOtherOpen(true);
            if (isStandard) onChange('');
          }}
          activeOpacity={0.8}
          accessibilityRole="radio"
          accessibilityState={{ selected: otherOpen }}
          accessibilityLabel="Other blood type"
        >
          <Text style={[styles.bloodChipText, otherOpen && styles.bloodChipTextSelected]}>Other</Text>
        </TouchableOpacity>
      </View>
      {otherOpen && (
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          placeholder="Rare type, e.g. hh"
          placeholderTextColor="#9CA3AF"
          value={value}
          onChangeText={onChange}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={BLOOD_TYPE_MAX_LENGTH}
          autoFocus
          accessibilityLabel="Other blood type, up to 5 characters"
        />
      )}
    </View>
  );
}

function ListField({
  section,
  items,
  onChange,
}: {
  section: ListSection;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const full = items.length >= LIST_MAX_ITEMS;
  const alert = section.critical && items.length > 0;
  const suggestions = section.suggestions.filter((item) => !includesIgnoreCase(items, item));

  function add(raw: string) {
    const next = [...items];
    for (const part of raw.split(',')) {
      const item = cleanItem(part);
      if (item && next.length < LIST_MAX_ITEMS && !includesIgnoreCase(next, item)) next.push(item);
    }
    if (next.length !== items.length) onChange(next);
    setDraft('');
  }

  return (
    <View style={[styles.card, alert && styles.cardAlert]}>
      <SectionHeading
        icon={section.icon}
        title={section.title}
        help={section.help}
        tone={alert ? 'alert' : 'default'}
        count={items.length}
      />

      {items.length > 0 && (
        <View style={styles.chipWrap}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={`${item}-${index}`}
              style={[styles.editChip, alert && styles.readChipAlert]}
              onPress={() => onChange(items.filter((_, current) => current !== index))}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item} from ${section.title}`}
            >
              <Text style={[styles.readChipText, alert && styles.readChipTextAlert]}>{item}</Text>
              <Ionicons name="close" size={14} color={alert ? '#B42318' : '#0D6053'} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {full ? (
        <Text style={styles.limitText}>Maximum of {LIST_MAX_ITEMS} items reached. Remove one to add another.</Text>
      ) : (
        <>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={section.placeholder}
              placeholderTextColor="#9CA3AF"
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => add(draft)}
              onBlur={() => add(draft)}
              submitBehavior="submit"
              returnKeyType="done"
              maxLength={ITEM_MAX_LENGTH}
              accessibilityLabel={`Add to ${section.title}`}
            />
            <TouchableOpacity
              style={[styles.addBtn, !draft.trim() && styles.addBtnDisabled]}
              onPress={() => add(draft)}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityLabel={`Add ${draft.trim() || 'item'} to ${section.title}`}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {suggestions.length > 0 && (
            <View style={styles.suggestionWrap}>
              <Text style={styles.suggestionLabel}>Quick add</Text>
              <View style={styles.chipWrap}>
                {suggestions.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={styles.suggestionChip}
                    onPress={() => add(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${item} to ${section.title}`}
                  >
                    <Ionicons name="add" size={13} color="#53645D" />
                    <Text style={styles.suggestionText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#F0F7F4', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  desc: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  gate: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF7ED', padding: 14, borderRadius: 12, marginBottom: 16,
  },
  gateText: { flex: 1, fontSize: 13, color: '#B45309', lineHeight: 18 },
  gateMapIcon: { alignSelf: 'stretch', marginTop: 28 },
  btn: {
    height: 46, minWidth: 160, borderRadius: 12, backgroundColor: '#0D6053',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  content: { padding: 16, paddingBottom: 32 },
  link: { fontSize: 13, fontWeight: '800', color: '#0D6053' },

  // Summary hero
  hero: { backgroundColor: '#0D6053', borderRadius: 20, padding: 18, marginBottom: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bloodBadge: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  bloodBadgeText: { fontSize: 24, fontWeight: '900', color: '#B42318', marginTop: -2 },
  bloodBadgeUnknown: { color: '#9CA3AF' },
  heroLabel: { fontSize: 12, fontWeight: '700', color: '#A7D7C9', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },
  sharingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: '#E7F6F1', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, marginTop: 8,
  },
  sharingText: { fontSize: 11, fontWeight: '800', color: '#0D6053' },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.16)', marginVertical: 16 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  progressValue: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#7DD3B8' },
  heroMeta: { fontSize: 12, color: '#A7D7C9', marginTop: 10 },

  reviewNudge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FCD9A8',
    borderRadius: 14, padding: 12, marginBottom: 14,
  },
  reviewNudgeText: { flex: 1, fontSize: 13, color: '#8A4B06', lineHeight: 18 },

  // Cards and sections
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#EEF2F6',
  },
  cardAlert: { borderColor: '#FECDCA', backgroundColor: '#FFFBFA' },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  sectionIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#E7F6F1',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionIconAlert: { backgroundColor: '#FEE4E2' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 1 },
  sectionTitleAlert: { color: '#B42318' },
  sectionHelp: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginTop: 2 },
  countPill: {
    minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7,
    backgroundColor: '#E7F6F1', alignItems: 'center', justifyContent: 'center',
  },
  countPillAlert: { backgroundColor: '#FEE4E2' },
  countText: { fontSize: 12, fontWeight: '800', color: '#0D6053' },
  countTextAlert: { color: '#B42318' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  readChip: {
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#F0F7F4', borderWidth: 1, borderColor: '#D5EAE1',
  },
  readChipAlert: { backgroundColor: '#FEF3F2', borderColor: '#FECDCA' },
  readChipText: { fontSize: 13, fontWeight: '700', color: '#0D6053', maxWidth: 260 },
  readChipTextAlert: { color: '#B42318' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyText: { fontSize: 13, color: '#9CA3AF' },
  notesText: { fontSize: 14, color: '#263A32', lineHeight: 21 },

  primaryBtn: {
    height: 50, borderRadius: 14, backgroundColor: '#0D6053',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  privacyNote: { flexDirection: 'row', gap: 8, marginTop: 16, paddingHorizontal: 4 },
  privacyText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 18 },

  // Editor
  introCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#E7F6F1', borderRadius: 16, padding: 14, marginBottom: 14,
  },
  introTitle: { fontSize: 15, fontWeight: '800', color: '#0D6053' },
  introText: { fontSize: 13, color: '#2F5D52', lineHeight: 19, marginTop: 2 },
  editNote: { fontSize: 13, color: '#6B7280', marginBottom: 12, paddingHorizontal: 4 },

  bloodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bloodExtraRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  bloodChip: {
    flexBasis: '22%', flexGrow: 1, height: 46, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#DDE5E1', backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  bloodChipWide: { flexBasis: 0 },
  bloodChipSelected: { backgroundColor: '#0D6053', borderColor: '#0D6053' },
  bloodChipText: { fontSize: 15, fontWeight: '800', color: '#40534B' },
  bloodChipTextSelected: { color: '#FFFFFF' },

  editChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, paddingLeft: 12, paddingRight: 9, minHeight: 36,
    backgroundColor: '#F0F7F4', borderWidth: 1, borderColor: '#D5EAE1',
  },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  addBtn: {
    width: 48, borderRadius: 12, backgroundColor: '#0D6053',
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  suggestionWrap: { marginTop: 12 },
  suggestionLabel: {
    fontSize: 11, fontWeight: '700', color: '#8A9691',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  suggestionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 18, paddingHorizontal: 11, minHeight: 34,
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#C5D2CC', backgroundColor: '#FFFFFF',
  },
  suggestionText: { fontSize: 12, fontWeight: '600', color: '#53645D' },
  limitText: { fontSize: 12, color: '#A15C08', marginTop: 12 },

  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827',
  },
  textArea: { minHeight: 96 },
  counter: { fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 6 },

  errorBox: {
    flexDirection: 'row', gap: 10, backgroundColor: '#FEF3F2',
    borderWidth: 1, borderColor: '#FECDCA', borderRadius: 14, padding: 12,
  },
  errorTitle: { fontSize: 13, fontWeight: '800', color: '#B42318' },
  errorText: { fontSize: 13, color: '#B42318', marginTop: 2, lineHeight: 18 },
  retryBtn: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },

  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF2F6',
  },
  saveStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  saveStatusText: { flex: 1, fontSize: 13, fontWeight: '600' },
  doneBtn: {
    height: 46, minWidth: 104, borderRadius: 12, backgroundColor: '#0D6053',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22,
  },
  doneBtnBusy: { opacity: 0.8 },
  doneBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
