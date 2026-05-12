export const days = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];

export const months = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december'
];

export const DEFAULT_SUBJECTS = [
    {
        key: 'matte',
        label: 'Matte',
        icon: 'M',
        aliases: ['matte', 'matematik'],
        color: { bg: '#778899', light: '#edf0f3', text: '#2e3d4f' },
    },
    {
        key: 'svenska',
        label: 'Svenska',
        icon: 'Sv',
        aliases: ['svenska'],
        color: { bg: '#D4AF37', light: '#fdf7e0', text: '#7a6100' },
    },
    {
        key: 'engelska',
        label: 'Engelska',
        icon: 'En',
        aliases: ['engelska'],
        color: { bg: '#B26666', light: '#f9ecec', text: '#5e2222' },
    },
    {
        key: 'biologi',
        label: 'Biologi',
        icon: 'Bi',
        aliases: ['biologi'],
        color: { bg: '#8FBC8F', light: '#eef6ee', text: '#2d5a2d' },
    },
    {
        key: 'kemi',
        label: 'Kemi',
        icon: 'Ke',
        aliases: ['kemi'],
        color: { bg: '#6B8E23', light: '#eef3e2', text: '#354712' },
    },
    {
        key: 'fysik',
        label: 'Fysik',
        icon: 'Fy',
        aliases: ['fysik'],
        color: { bg: '#555555', light: '#ebebeb', text: '#222222' },
    },
    {
        key: 'teknik',
        label: 'Teknik',
        icon: 'Te',
        aliases: ['teknik'],
        color: { bg: '#B0B0B0', light: '#f2f2f2', text: '#3a3a3a' },
    },
];

// Legacy export kept for older subject-color consumers; remove once all lookups use js/subjects.js directly.
export const SUBJECT_COLORS = DEFAULT_SUBJECTS.reduce((map, subject) => {
    map[subject.key] = subject.color;
    return map;
}, {});
