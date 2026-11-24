
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "account_events": {
                  Row: {
                    "actor_id": string,"at": string,"id": number,"kind": string,"target_user_id": string | null,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"at"?: string,"id"?: never,"kind": string,"target_user_id"?: string | null,"wedding_id": string
                  }
                  Update: {
                    "actor_id"?: string,"at"?: string,"id"?: never,"kind"?: string,"target_user_id"?: string | null,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "account_events_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "actor_id": string | null,"at": string,"id": number,"new_data": Json | null,"old_data": Json | null,"op": string,"row_id": string | null,"table_name": string,"wedding_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"at"?: string,"id"?: never,"new_data"?: Json | null,"old_data"?: Json | null,"op": string,"row_id"?: string | null,"table_name": string,"wedding_id"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"at"?: string,"id"?: never,"new_data"?: Json | null,"old_data"?: Json | null,"op"?: string,"row_id"?: string | null,"table_name"?: string,"wedding_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"heartbeats": {
                  Row: {
                    "details": NonNullable<Json>,"id": number,"ran_at": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "details"?: NonNullable<Json>,"id"?: never,"ran_at"?: string,"source": string
                  }
                  Update: {
                    "details"?: NonNullable<Json>,"id"?: never,"ran_at"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"created_by": string | null,"email": string,"expires_at": string | null,"id": string,"invitee_user_id": string | null,"last_sent_at": string | null,"method": string,"revoked_at": string | null,"send_count": number,"slot": string,"token_hash": string | null,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"email": string,"expires_at"?: string | null,"id"?: string,"invitee_user_id"?: string | null,"last_sent_at"?: string | null,"method": string,"revoked_at"?: string | null,"send_count"?: number,"slot"?: string,"token_hash"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string,"expires_at"?: string | null,"id"?: string,"invitee_user_id"?: string | null,"last_sent_at"?: string | null,"method"?: string,"revoked_at"?: string | null,"send_count"?: number,"slot"?: string,"token_hash"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"partner_slot": string | null,"role": string,"user_id": string,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"partner_slot"?: string | null,"role": string,"user_id": string,"wedding_id": string
                  }
                  Update: {
                    "created_at"?: string,"partner_slot"?: string | null,"role"?: string,"user_id"?: string,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"user_wedding_state": {
                  Row: {
                    "last_export_at": string | null,"last_seen_at": string | null,"previous_seen_at": string | null,"user_id": string,"wedding_id": string,"welcome_dismissed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "last_export_at"?: string | null,"last_seen_at"?: string | null,"previous_seen_at"?: string | null,"user_id": string,"wedding_id": string,"welcome_dismissed_at"?: string | null
                  }
                  Update: {
                    "last_export_at"?: string | null,"last_seen_at"?: string | null,"previous_seen_at"?: string | null,"user_id"?: string,"wedding_id"?: string,"welcome_dismissed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_wedding_state_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"wedding_partners": {
                  Row: {
                    "created_at": string,"created_by": string | null,"email": string,"first_name": string | null,"id": string,"label": string | null,"last_name": string | null,"slot": string,"updated_at": string,"updated_by": string | null,"user_id": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"email": string,"first_name"?: string | null,"id"?: string,"label"?: string | null,"last_name"?: string | null,"slot": string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"email"?: string,"first_name"?: string | null,"id"?: string,"label"?: string | null,"last_name"?: string | null,"slot"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wedding_partners_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"weddings": {
                  Row: {
                    "applied_reference_date": string | null,"comune": string | null,"created_at": string,"created_by": string | null,"guest_band": string | null,"id": string,"manual_reference_option_id": string | null,"onboarding_answers": NonNullable<Json>,"onboarding_completed_at": string | null,"onboarding_unknown": (string)[],"region": string | null,"rite": string | null,"style_label": string | null,"style_note": string | null,"theme_id": string,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_reference_date"?: string | null,"comune"?: string | null,"created_at"?: string,"created_by"?: string | null,"guest_band"?: string | null,"id"?: string,"manual_reference_option_id"?: string | null,"onboarding_answers"?: NonNullable<Json>,"onboarding_completed_at"?: string | null,"onboarding_unknown"?: (string)[],"region"?: string | null,"rite"?: string | null,"style_label"?: string | null,"style_note"?: string | null,"theme_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "applied_reference_date"?: string | null,"comune"?: string | null,"created_at"?: string,"created_by"?: string | null,"guest_band"?: string | null,"id"?: string,"manual_reference_option_id"?: string | null,"onboarding_answers"?: NonNullable<Json>,"onboarding_completed_at"?: string | null,"onboarding_unknown"?: (string)[],"region"?: string | null,"rite"?: string | null,"style_label"?: string | null,"style_note"?: string | null,"theme_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_pending_invitation":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"auth_user_id_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"authorize_account_op":
{ Args: { "p_op": string,"p_target_slot"?: string }; Returns: Json
                           },
"create_invitation":
{ Args: { "p_email": string,"p_invitee_user_id"?: string,"p_method": string,"p_token_hash"?: string }; Returns: Json
                           },
"create_wedding":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"dismiss_welcome":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"has_permission":
{ Args: { "p_action": string,"p_area": string,"p_wedding_id": string }; Returns: boolean
                           },
"last_heartbeat":
{ Args: { "p_source"?: string }; Returns: string
                           },
"login_gate":
{ Args: { "p_email_key": string,"p_ip_key"?: string }; Returns: Json
                           },
"login_record":
{ Args: { "p_email_key": string,"p_ip_key": string,"p_lock_minutes"?: number,"p_max_email"?: number,"p_max_ip"?: number,"p_success": boolean,"p_window_minutes"?: number }; Returns: Json
                           },
"record_account_event":
{ Args: { "p_kind": string,"p_target_user_id"?: string }; Returns: number
                           },
"record_export":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"record_heartbeat":
{ Args: { "p_details"?: Json,"p_source": string }; Returns: undefined
                           },
"record_seen":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"revoke_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"rotate_invitation":
{ Args: { "p_invitation_id": string,"p_token_hash": string }; Returns: Json
                           },
"sync_my_email":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"update_partner_email":
{ Args: { "p_email": string,"p_slot": string }; Returns: undefined
                           },
"upsert_partner_b":
{ Args: { "p_email": string,"p_first_name"?: string,"p_label"?: string,"p_last_name"?: string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
