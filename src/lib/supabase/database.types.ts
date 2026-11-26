
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
                },"budget_categories": {
                  Row: {
                    "assigned_cents": number | null,"created_at": string,"created_by": string | null,"default_key": string | null,"deleted_at": string | null,"id": string,"name": string,"sort_order": number,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"default_key"?: string | null,"deleted_at"?: string | null,"id"?: string,"name": string,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "assigned_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"default_key"?: string | null,"deleted_at"?: string | null,"id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_categories_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"budget_items": {
                  Row: {
                    "agreed_cents": number | null,"category_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"description": string,"id": string,"planned_cents": number,"status": string,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreed_cents"?: number | null,"category_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"description": string,"id"?: string,"planned_cents"?: number,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "agreed_cents"?: number | null,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"description"?: string,"id"?: string,"planned_cents"?: number,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_items_category_id_wedding_id_fkey"
      columns: ["category_id","wedding_id"]
isOneToOne: false
      referencedRelation: "budget_categories"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "budget_items_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"budget_versions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"reason": string | null,"total_cents": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"reason"?: string | null,"total_cents": number,"wedding_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"reason"?: string | null,"total_cents"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_versions_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"date_scenarios": {
                  Row: {
                    "created_at": string,"created_by": string | null,"date_from": string,"date_to": string | null,"id": string,"kind": string,"location_option_id": string | null,"option_id": string,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"date_from": string,"date_to"?: string | null,"id"?: string,"kind": string,"location_option_id"?: string | null,"option_id": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"date_from"?: string,"date_to"?: string | null,"id"?: string,"kind"?: string,"location_option_id"?: string | null,"option_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "date_scenarios_location_option_id_wedding_id_fkey"
      columns: ["location_option_id","wedding_id"]
isOneToOne: false
      referencedRelation: "decision_options"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "date_scenarios_option_id_wedding_id_fkey"
      columns: ["option_id","wedding_id"]
isOneToOne: false
      referencedRelation: "decision_options"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "date_scenarios_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"decision_events": {
                  Row: {
                    "actor_id": string | null,"at": string,"decision_id": string,"id": number,"kind": string,"option_id": string | null,"payload": NonNullable<Json>,"reason": string | null,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"at"?: string,"decision_id": string,"id"?: never,"kind": string,"option_id"?: string | null,"payload"?: NonNullable<Json>,"reason"?: string | null,"wedding_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"at"?: string,"decision_id"?: string,"id"?: never,"kind"?: string,"option_id"?: string | null,"payload"?: NonNullable<Json>,"reason"?: string | null,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "decision_events_decision_id_wedding_id_fkey"
      columns: ["decision_id","wedding_id"]
isOneToOne: false
      referencedRelation: "decisions"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "decision_events_option_id_wedding_id_fkey"
      columns: ["option_id","wedding_id"]
isOneToOne: false
      referencedRelation: "decision_options"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "decision_events_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"decision_options": {
                  Row: {
                    "comune": string | null,"cons": (string)[],"cost_cents": number | null,"created_at": string,"created_by": string | null,"decision_id": string,"deleted_at": string | null,"deleted_by": string | null,"id": string,"link": string | null,"notes": string | null,"pros": (string)[],"status": string,"title": string,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comune"?: string | null,"cons"?: (string)[],"cost_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"decision_id": string,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"link"?: string | null,"notes"?: string | null,"pros"?: (string)[],"status"?: string,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "comune"?: string | null,"cons"?: (string)[],"cost_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"decision_id"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"link"?: string | null,"notes"?: string | null,"pros"?: (string)[],"status"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "decision_options_decision_id_wedding_id_fkey"
      columns: ["decision_id","wedding_id"]
isOneToOne: false
      referencedRelation: "decisions"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "decision_options_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"decisions": {
                  Row: {
                    "chosen_at": string | null,"chosen_by": string | null,"chosen_option_id": string | null,"created_at": string,"created_by": string | null,"id": string,"key": string,"question": string,"status": string,"type": string,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chosen_at"?: string | null,"chosen_by"?: string | null,"chosen_option_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"key": string,"question": string,"status"?: string,"type": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "chosen_at"?: string | null,"chosen_by"?: string | null,"chosen_option_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"key"?: string,"question"?: string,"status"?: string,"type"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "decisions_chosen_option_fk"
      columns: ["chosen_option_id","wedding_id"]
isOneToOne: false
      referencedRelation: "decision_options"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "decisions_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"guest_groups": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"id": string,"import_batch_id": string | null,"name": string,"rsvp_mode": string,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"import_batch_id"?: string | null,"name": string,"rsvp_mode"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"import_batch_id"?: string | null,"name"?: string,"rsvp_mode"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guest_groups_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"guest_tables": {
                  Row: {
                    "capacity": number | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"id": string,"name": string,"pos_x": number | null,"pos_y": number | null,"shape": string,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: number | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"name": string,"pos_x"?: number | null,"pos_y"?: number | null,"shape"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "capacity"?: number | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"name"?: string,"pos_x"?: number | null,"pos_y"?: number | null,"shape"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guest_tables_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"guests": {
                  Row: {
                    "category": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"email": string | null,"first_name": string,"group_id": string | null,"id": string,"import_batch_id": string | null,"last_name": string | null,"notes": string | null,"phone": string | null,"side": string | null,"table_id": string | null,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"email"?: string | null,"first_name": string,"group_id"?: string | null,"id"?: string,"import_batch_id"?: string | null,"last_name"?: string | null,"notes"?: string | null,"phone"?: string | null,"side"?: string | null,"table_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"email"?: string | null,"first_name"?: string,"group_id"?: string | null,"id"?: string,"import_batch_id"?: string | null,"last_name"?: string | null,"notes"?: string | null,"phone"?: string | null,"side"?: string | null,"table_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guests_group_id_wedding_id_fkey"
      columns: ["group_id","wedding_id"]
isOneToOne: false
      referencedRelation: "guest_groups"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "guests_table_id_wedding_id_fkey"
      columns: ["table_id","wedding_id"]
isOneToOne: false
      referencedRelation: "guest_tables"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "guests_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
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
                },"notification_log": {
                  Row: {
                    "attempts": number,"batch_key": string,"claimed_at": string | null,"created_at": string,"id": number,"item_keys": (string)[],"kind": string,"last_error": string | null,"sent_at": string | null,"status": string,"user_id": string,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"batch_key": string,"claimed_at"?: string | null,"created_at"?: string,"id"?: never,"item_keys"?: (string)[],"kind": string,"last_error"?: string | null,"sent_at"?: string | null,"status": string,"user_id": string,"wedding_id": string
                  }
                  Update: {
                    "attempts"?: number,"batch_key"?: string,"claimed_at"?: string | null,"created_at"?: string,"id"?: never,"item_keys"?: (string)[],"kind"?: string,"last_error"?: string | null,"sent_at"?: string | null,"status"?: string,"user_id"?: string,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_log_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "digest_enabled": boolean,"reminders_enabled": boolean,"updated_at": string,"user_id": string,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "digest_enabled"?: boolean,"reminders_enabled"?: boolean,"updated_at"?: string,"user_id": string,"wedding_id": string
                  }
                  Update: {
                    "digest_enabled"?: boolean,"reminders_enabled"?: boolean,"updated_at"?: string,"user_id"?: string,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"option_reactions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"option_id": string,"reaction": string,"updated_at": string,"updated_by": string | null,"user_id": string,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"option_id": string,"reaction": string,"updated_at"?: string,"updated_by"?: string | null,"user_id": string,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"option_id"?: string,"reaction"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "option_reactions_option_id_wedding_id_fkey"
      columns: ["option_id","wedding_id"]
isOneToOne: false
      referencedRelation: "decision_options"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "option_reactions_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"deleted_at": string | null,"due_date": string | null,"id": string,"item_id": string,"kind": string,"paid": boolean,"paid_on": string | null,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"due_date"?: string | null,"id"?: string,"item_id": string,"kind"?: string,"paid"?: boolean,"paid_on"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"due_date"?: string | null,"id"?: string,"item_id"?: string,"kind"?: string,"paid"?: boolean,"paid_on"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_item_id_wedding_id_fkey"
      columns: ["item_id","wedding_id"]
isOneToOne: false
      referencedRelation: "budget_items"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "payments_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"rsvp_link_people": {
                  Row: {
                    "guest_id": string,"link_id": string,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "guest_id": string,"link_id": string,"wedding_id": string
                  }
                  Update: {
                    "guest_id"?: string,"link_id"?: string,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rsvp_link_people_guest_id_wedding_id_fkey"
      columns: ["guest_id","wedding_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "rsvp_link_people_link_id_wedding_id_fkey"
      columns: ["link_id","wedding_id"]
isOneToOne: false
      referencedRelation: "rsvp_links"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "rsvp_link_people_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"rsvp_links": {
                  Row: {
                    "created_at": string,"created_by": string | null,"group_id": string | null,"guest_id": string | null,"id": string,"revoked_at": string | null,"revoked_by": string | null,"shared_at": string | null,"shared_by": string | null,"token_hash": string,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"group_id"?: string | null,"guest_id"?: string | null,"id": string,"revoked_at"?: string | null,"revoked_by"?: string | null,"shared_at"?: string | null,"shared_by"?: string | null,"token_hash": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"group_id"?: string | null,"guest_id"?: string | null,"id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"shared_at"?: string | null,"shared_by"?: string | null,"token_hash"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rsvp_links_group_id_wedding_id_fkey"
      columns: ["group_id","wedding_id"]
isOneToOne: false
      referencedRelation: "guest_groups"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "rsvp_links_guest_id_wedding_id_fkey"
      columns: ["guest_id","wedding_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "rsvp_links_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"rsvp_responses": {
                  Row: {
                    "answered_at": string,"created_at": string,"created_by": string | null,"diet": (string)[],"diet_note": string | null,"id": string,"source": string,"status": string,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_at"?: string,"created_at"?: string,"created_by"?: string | null,"diet"?: (string)[],"diet_note"?: string | null,"id": string,"source"?: string,"status": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "answered_at"?: string,"created_at"?: string,"created_by"?: string | null,"diet"?: (string)[],"diet_note"?: string | null,"id"?: string,"source"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rsvp_responses_id_wedding_id_fkey"
      columns: ["id","wedding_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id","wedding_id"]
    },{
      foreignKeyName: "rsvp_responses_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"task_suggestion_dismissals": {
                  Row: {
                    "dismissed_at": string,"dismissed_by": string | null,"id": string,"kind": string,"template_key": string,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dismissed_at"?: string,"dismissed_by"?: string | null,"id"?: string,"kind": string,"template_key": string,"wedding_id": string
                  }
                  Update: {
                    "dismissed_at"?: string,"dismissed_by"?: string | null,"id"?: string,"kind"?: string,"template_key"?: string,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_suggestion_dismissals_wedding_id_fkey"
      columns: ["wedding_id"]
isOneToOne: false
      referencedRelation: "weddings"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "advice": string | null,"assignee": string,"category": string | null,"completed_at": string | null,"completed_by": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"due_date": string | null,"due_overridden": boolean,"id": string,"needs_review": boolean,"notes": string | null,"reminders_enabled": boolean,"source": string,"status": string,"template_key": string | null,"template_offset": Json | null,"template_version": number | null,"title": string,"updated_at": string,"updated_by": string | null,"version": number,"wedding_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "advice"?: string | null,"assignee"?: string,"category"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"due_date"?: string | null,"due_overridden"?: boolean,"id"?: string,"needs_review"?: boolean,"notes"?: string | null,"reminders_enabled"?: boolean,"source"?: string,"status"?: string,"template_key"?: string | null,"template_offset"?: Json | null,"template_version"?: number | null,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id": string
                  }
                  Update: {
                    "advice"?: string | null,"assignee"?: string,"category"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"due_date"?: string | null,"due_overridden"?: boolean,"id"?: string,"needs_review"?: boolean,"notes"?: string | null,"reminders_enabled"?: boolean,"source"?: string,"status"?: string,"template_key"?: string | null,"template_offset"?: Json | null,"template_version"?: number | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"wedding_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_wedding_id_fkey"
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
                    {
      foreignKeyName: "weddings_manual_reference_fk"
      columns: ["manual_reference_option_id","id"]
isOneToOne: false
      referencedRelation: "decision_options"
      referencedColumns: ["id","wedding_id"]
    }
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
"acknowledge_task_review":
{ Args: { "p_task_id"?: string }; Returns: number
                           },
"add_decision_note":
{ Args: { "p_decision_id": string,"p_note": string,"p_option_id"?: string }; Returns: number
                           },
"auth_user_id_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"authorize_account_op":
{ Args: { "p_new_email"?: string,"p_op": string,"p_target_slot"?: string }; Returns: Json
                           },
"choose_option":
{ Args: { "p_decision_id": string,"p_exact_date"?: string,"p_expected_version"?: number,"p_option_id": string }; Returns: Json
                           },
"complete_onboarding":
{ Args: { "p_scenarios"?: Json,"p_tasks"?: Json }; Returns: Json
                           },
"create_guest_family":
{ Args: { "p_name": string,"p_rows": Json,"p_side": string }; Returns: Json
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
"guests_bulk":
{ Args: { "p_ids": (string)[],"p_op": string,"p_target"?: string }; Returns: Json
                           },
"guests_bulk_undo":
{ Args: { "p_previous": Json }; Returns: Json
                           },
"has_permission":
{ Args: { "p_action": string,"p_area": string,"p_wedding_id": string }; Returns: boolean
                           },
"import_guests":
{ Args: { "p_rows": Json }; Returns: Json
                           },
"insert_template_tasks":
{ Args: { "p_tasks": Json }; Returns: Json
                           },
"invitation_by_token":
{ Args: { "p_token_hash": string }; Returns: Json
                           },
"job_claim_notification":
{ Args: { "p_batch_key": string,"p_daily_cap"?: number,"p_item_keys"?: (string)[],"p_kind": string,"p_monthly_cap"?: number,"p_now"?: string,"p_user_id": string,"p_wedding_id": string }; Returns: Json
                           },
"job_fail_notification":
{ Args: { "p_error"?: string,"p_id": number }; Returns: string
                           },
"job_mark_notification_sent":
{ Args: { "p_id": number,"p_now"?: string }; Returns: string
                           },
"job_quota_status":
{ Args: { "p_now"?: string }; Returns: Json
                           },
"job_recipients":
{ Args: Record<PropertyKey, never>; Returns: {
              "digest_enabled": boolean,"email": string,"first_name": string,"label": string,"partner_slot": string,"reminders_enabled": boolean,"user_id": string,"wedding_id": string
            }[]
                           },
"job_sent_item_keys":
{ Args: { "p_since": string,"p_user_id": string }; Returns: (string)[]
                           },
"job_unsubscribe":
{ Args: { "p_kind": string,"p_user_id": string }; Returns: undefined
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
"move_budget_items":
{ Args: { "p_from": string,"p_to": string }; Returns: number
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
"reopen_decision":
{ Args: { "p_decision_id": string,"p_expected_version"?: number,"p_reason": string }; Returns: Json
                           },
"revoke_invitation":
{ Args: { "p_invitation_id": string }; Returns: Json
                           },
"rotate_invitation":
{ Args: { "p_invitation_id": string,"p_token_hash": string }; Returns: Json
                           },
"rsvp_create_links":
{ Args: { "p_items": Json,"p_now"?: string }; Returns: Json
                           },
"rsvp_gate":
{ Args: { "p_ip_key"?: string,"p_now"?: string,"p_token_hash": string }; Returns: Json
                           },
"rsvp_mark_shared":
{ Args: { "p_link_id": string,"p_now"?: string }; Returns: Json
                           },
"rsvp_page":
{ Args: { "p_ip_key"?: string,"p_now"?: string,"p_token_hash": string }; Returns: Json
                           },
"rsvp_revoke_link":
{ Args: { "p_link_id": string }; Returns: Json
                           },
"rsvp_rotate_link":
{ Args: { "p_link_id": string,"p_new_hash": string,"p_new_id": string,"p_now"?: string }; Returns: Json
                           },
"rsvp_status":
{ Args: { "p_now"?: string }; Returns: Json
                           },
"rsvp_submit":
{ Args: { "p_answers": Json,"p_ip_key": string,"p_now"?: string,"p_token_hash": string }; Returns: Json
                           },
"rsvp_unmark_shared":
{ Args: { "p_link_id": string,"p_previous": Json }; Returns: Json
                           },
"set_reference_scenario":
{ Args: { "p_option_id"?: string }; Returns: Json
                           },
"sync_my_email":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"sync_timeline":
{ Args: { "p_wedding_id"?: string }; Returns: number
                           },
"undo_guest_import":
{ Args: { "p_batch_id": string }; Returns: Json
                           },
"update_partner_email":
{ Args: { "p_email": string,"p_slot": string }; Returns: Json
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
