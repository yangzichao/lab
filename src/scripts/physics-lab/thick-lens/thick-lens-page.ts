import type { PhysicsLabDefinition } from '../physics-lab-catalog-types';
import type { PhysicsLabLocale } from '../physics-lab-i18n';
import type { PhysicsLabPage } from '../physics-lab-page-types';

export const thickLensDefinition: PhysicsLabDefinition = {
  slug: 'thick-lens-refraction',
  icon: 'ph-eyeglasses',
  text: {
    zh: {
      title: 'Thick Lens Ray Tracing',
      eyebrow: '几何光学 · 双球面折射',
      tagline: '透镜有厚度，物体也有深度；每一束光都要折射两次。',
      description: '光线先与前球面相交，再按 Snell 定律进入玻璃，最后从后球面折射回空气。物体前后表面使用独立光束，因此会形成两个不同像平面。',
      notice: '这不是把厚度塞进薄透镜公式。图中路径来自逐界面几何追迹；读数中的主平面与等效焦距只负责概括近轴结果。',
    },
    en: {
      title: 'Thick Lens Ray Tracing',
      eyebrow: 'Geometrical optics · two-surface refraction',
      tagline: 'The lens has thickness and the object has depth, so every ray refracts twice.',
      description: 'Each ray intersects the front sphere, refracts into glass by Snell\'s law, then leaves through the rear sphere. Separate bundles from the front and rear object faces form distinct image planes.',
      notice: 'This does not hide thickness inside the thin-lens equation. Visible paths come from interface-by-interface ray tracing; principal planes and effective focal length only summarize the paraxial result.',
    },
  },
};

export function createThickLensPage(locale: PhysicsLabLocale): PhysicsLabPage {
  const english = locale === 'en';
  return {
    slug: 'thick-lens-refraction',
    readouts: [
      { id: 'effectiveFocalLength', label: english ? 'Effective focal length' : '等效焦距', initialValue: '104 mm' },
      { id: 'frontImage', label: english ? 'Front-face image' : '物体前表面像', initialValue: '+156 mm' },
      { id: 'rearImage', label: english ? 'Rear-face image' : '物体后表面像', initialValue: '+169 mm' },
      { id: 'imageDepth', label: english ? 'Image depth' : '像的轴向厚度', initialValue: '13 mm' },
      { id: 'rayStatus', label: english ? 'Ray trace' : '光线追迹', initialValue: english ? '6 rays transmitted' : '6 条光线透射' },
    ],
    controls: {
      ariaLabel: english ? 'Thick lens controls' : '厚透镜控制',
      eyebrow: english ? 'Controls' : '控制',
      title: english ? 'Two refracting surfaces' : '两个折射面',
      actions: [{ id: 'reset', icon: 'ph-arrow-counter-clockwise', label: english ? 'Reset' : '重置' }],
      presets: [
        { id: 'camera', label: english ? 'Camera lens' : '相机镜头' },
        { id: 'ballLens', label: english ? 'Ball lens' : '球透镜' },
        { id: 'flatBack', label: english ? 'Plano-convex' : '平凸透镜' },
      ],
      toggles: [
        { id: 'showNormals', label: english ? 'Surface normals' : '界面法线', description: english ? 'Show the local normal used by Snell\'s law.' : '显示 Snell 定律使用的局部法线。', checked: true },
        { id: 'showParaxial', label: english ? 'Principal planes' : '主平面', description: english ? 'Overlay the paraxial H and H prime planes.' : '叠加近轴主平面 H 与 H\'。', checked: true },
      ],
      fields: [
        { id: 'lensThickness', label: english ? 'Lens thickness' : '透镜厚度', symbolLatex: 't', outputValue: '28 mm', min: 4, max: 60, step: 1, value: 28 },
        { id: 'objectDepth', label: english ? 'Object depth' : '物体厚度', symbolLatex: '\\Delta d_o', outputValue: '30 mm', min: 0, max: 80, step: 2, value: 30 },
        { id: 'objectDistance', label: english ? 'Front distance' : '前表面物距', symbolLatex: 'd_o', outputValue: '260 mm', min: 160, max: 380, step: 5, value: 260 },
        { id: 'refractiveIndex', label: english ? 'Glass index' : '玻璃折射率', symbolLatex: 'n', outputValue: '1.52', min: 1.35, max: 1.8, step: 0.01, value: 1.52 },
        { id: 'frontRadius', label: english ? 'Front radius' : '前表面曲率半径', symbolLatex: 'R_1', outputValue: '+110 mm', min: 70, max: 180, step: 5, value: 110 },
        { id: 'rearRadius', label: english ? 'Rear radius' : '后表面曲率半径', symbolLatex: 'R_2', outputValue: '−110 mm', min: -180, max: -70, step: 5, value: -110 },
      ],
    },
  };
}
