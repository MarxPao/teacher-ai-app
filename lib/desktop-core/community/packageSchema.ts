import { z } from 'zod'
import { SkillGraphV2Schema, GraphCompatSchema, type SkillGraphV2 } from '../../contracts/skillgraph'

export const PublisherSchema = z.object({
  key_id: z.string().min(1),
  handle: z.string().min(1),
}).strict()
export type Publisher = z.infer<typeof PublisherSchema>

export const HostPlaceholderSchema = z.object({
  placeholder: z.string().regex(/^h\d+\.invalid$/, 'O placeholder do host deve seguir o formato "h<N>.invalid"'),
  role: z.enum(['portal', 'idp', 'other']),
  suffix_hint: z.string().optional(),
}).strict()
export type HostPlaceholder = z.infer<typeof HostPlaceholderSchema>

export const PackageManifestSchema = z.object({
  package_id: z.string().min(1).regex(/^[a-z0-9_-]+$/, 'package_id deve ser um slug em minúsculas'),
  map_version: z.number().int().min(1),
  spec_version: z.literal('2.0'),
  publisher: PublisherSchema,
  license: z.enum(['CC0-1.0', 'CC-BY-4.0']),
  platform_hint: z.string().optional(),
  hosts: z.array(HostPlaceholderSchema).min(1),
  tasks: z.array(z.string().min(1)).min(1),
  compat: GraphCompatSchema.optional(),
  min_app_version: z.string().optional(),
  created_at: z.string().min(1),
}).strict()
export type PackageManifest = z.infer<typeof PackageManifestSchema>

export const PackageSignatureSchema = z.object({
  alg: z.literal('ed25519'),
  key_id: z.string().min(1),
  public_key: z.string().min(1),
  sig: z.string().min(1),
}).strict()
export type PackageSignature = z.infer<typeof PackageSignatureSchema>

export const SkillPackageSchema = z.object({
  pkg_format: z.literal('skillpkg/1'),
  manifest: PackageManifestSchema,
  content: z.record(z.string(), z.any()) as unknown as z.ZodType<SkillGraphV2>,
  signature: PackageSignatureSchema,
}).strict()
export type SkillPackage = z.infer<typeof SkillPackageSchema>
