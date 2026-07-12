import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const thickLensLesson = definePhysicsLabLesson({
  zh: {
    title: '厚透镜：从“一个平面折射”回到真实界面',
    background: '薄透镜把两个曲面之间的传播距离忽略掉。镜片变厚或曲率变强后，两次折射发生在不同位置，主平面也不再与镜片中心重合。',
    motivation: '相机镜组、显微物镜、眼球和球透镜都不能只靠单一薄透镜平面解释；有轴向厚度的物体还会把不同深度成像到不同像面。',
    focusQuestion: '透镜厚度和物体轴向厚度分别怎样改变最终像的位置与“像的厚度”？',
    keyInsight: '每条光线都要按“与前表面求交 → 折射 → 在玻璃中传播 → 与后表面求交 → 再折射”的顺序处理；物体每个深度点都有自己的光束。',
    formulas: [
      { title: '局部 Snell 定律', expressionLatex: String.raw`n_1\sin\theta_1=n_2\sin\theta_2`, explanation: '角度必须相对命中点的局部法线测量，而不是相对光轴。' },
      { title: '厚透镜等效光焦度', expressionLatex: String.raw`\Phi=(n-1)\left(\frac1{R_1}-\frac1{R_2}+\frac{(n-1)t}{nR_1R_2}\right)`, explanation: '最后一项就是厚度修正；等效焦距为 f=1/Φ。' },
    ],
    commonDifficulties: [
      { title: '不能在镜片中心只折一次', misconception: '只要算出等效焦距，所有真实光线都可以在中心突然转弯。', resolution: '等效焦距概括近轴输入输出关系；真实路径仍在两个曲面分别改变方向。' },
      { title: '物体厚度不是物高', misconception: '把物体画得更高就等于考虑了物体厚度。', resolution: '这里的厚度沿光轴方向。近端与远端具有不同物距，因此生成不同像距和纵向放大率。' },
    ],
    steps: [
      { title: '先退回薄透镜极限', instruction: '把镜片厚度调到最小，物体厚度调为零。', observation: '两个物面与像面合并，结果接近熟悉的薄透镜情形。' },
      { title: '只增加镜片厚度', instruction: '保持曲率和折射率不变，增大 t。', observation: '玻璃内传播段变长，主平面和等效焦距发生移动。' },
      { title: '展开物体深度', instruction: '增大物体厚度，比较琥珀与青色光束。', observation: '两个物面形成两个像面，像的轴向厚度一般不等于原物体厚度。' },
    ],
    takeaway: '薄透镜公式是厚透镜近轴追迹的极限；先理解逐界面折射，再使用等效焦距做摘要。',
  },
  en: {
    title: 'Thick lenses: return from one refraction plane to real interfaces',
    background: 'The thin-lens model neglects propagation between two curved surfaces. With greater thickness or stronger curvature, refractions occur at distinct locations and principal planes shift away from the lens center.',
    motivation: 'Camera groups, microscope objectives, eyes, and ball lenses cannot be understood as one abrupt bend. Objects with axial depth also send different depth planes to different image planes.',
    focusQuestion: 'How do lens thickness and object depth separately change image position and longitudinal image depth?',
    keyInsight: 'Process each ray as front-surface intersection, refraction, glass propagation, rear-surface intersection, then refraction again. Every object depth needs its own ray bundle.',
    formulas: [
      { title: 'Local Snell law', expressionLatex: String.raw`n_1\sin\theta_1=n_2\sin\theta_2`, explanation: 'Angles are measured from the local surface normal at the hit point, not from the optical axis.' },
      { title: 'Thick-lens optical power', expressionLatex: String.raw`\Phi=(n-1)\left(\frac1{R_1}-\frac1{R_2}+\frac{(n-1)t}{nR_1R_2}\right)`, explanation: 'The last term is the thickness correction, and effective focal length is f=1/Φ.' },
    ],
    commonDifficulties: [
      { title: 'Real rays do not bend once at the center', misconception: 'Once effective focal length is known, every physical ray can turn abruptly at the lens center.', resolution: 'Effective focal length summarizes a paraxial input-output relation; actual paths change direction at both surfaces.' },
      { title: 'Object depth is not object height', misconception: 'Drawing a taller arrow accounts for object thickness.', resolution: 'Depth here lies along the optical axis. Near and far faces have different object distances and therefore different image distances.' },
    ],
    steps: [
      { title: 'Recover the thin-lens limit', instruction: 'Minimize lens thickness and set object depth to zero.', observation: 'The two object and image planes merge, approaching the familiar thin-lens case.' },
      { title: 'Increase only lens thickness', instruction: 'Hold curvature and index fixed while increasing t.', observation: 'The path inside glass grows and the principal planes and effective focal length shift.' },
      { title: 'Expand object depth', instruction: 'Increase object depth and compare amber with teal bundles.', observation: 'Two object planes form two image planes; longitudinal image depth generally differs from object depth.' },
    ],
    takeaway: 'The thin-lens equation is a limit of paraxial thick-lens tracing; understand interface-by-interface refraction before using effective focal length as a summary.',
  },
});
