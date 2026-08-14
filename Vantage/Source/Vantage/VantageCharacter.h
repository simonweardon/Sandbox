#pragma once

#include "CoreMinimal.h"
#include "Engine/EngineTypes.h"
#include "GameFramework/Character.h"
#include "VantageCharacter.generated.h"

class ARevolver;
class UCameraComponent;
class UInputAction;
class UInputMappingContext;
class USpotLightComponent;
class USpringArmComponent;
class UStaticMeshComponent;
struct FInputActionValue;

/**
 * The player: a bearded gunslinger seen over his own shoulder.
 *
 * He is built from engine primitives the same way everything else here is -
 * there is no skeletal mesh and no animation asset in this project, so the walk
 * cycle, the aim and the beard are all geometry driven from code.
 *
 * His Enhanced Input assets are likewise built with NewObject at
 * PostInitializeComponents rather than loaded. See BuildInputBindings().
 */
UCLASS()
class VANTAGE_API AVantageCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AVantageCharacter();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void PostInitializeComponents() override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	/** Called by a zombie that has reached the player. */
	void TakeZombieHit(float Damage);

	bool IsDown() const { return bDown; }
	float GetHealth() const { return Health; }
	float GetMaxHealth() const { return MaxHealth; }
	ARevolver* GetRevolver() const { return Revolver; }

	/** Counts down after taking damage. Drives the red vignette on the HUD. */
	float GetDamageFlash() const { return DamageFlash; }

	/** Counts down after landing a shot. Drives the hit marker. */
	float GetHitMarker() const { return HitMarker; }
	bool WasLastHitHeadshot() const { return bLastHitHeadshot; }

	/** Puts the player back on their feet at the given spot. */
	void Revive(const FVector& At);

protected:
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Camera")
	TObjectPtr<USpringArmComponent> SpringArm;

	UPROPERTY(VisibleAnywhere, Category = "Vantage|Camera")
	TObjectPtr<UCameraComponent> Camera;

	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body")
	TObjectPtr<USceneComponent> BodyRoot;

	/** Pitches with the aim, so the gun arm tracks where the camera looks. */
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body")
	TObjectPtr<USceneComponent> AimPivot;

	/** Where the revolver is attached. */
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body")
	TObjectPtr<USceneComponent> GunHand;

	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body")
	TObjectPtr<USpotLightComponent> Flashlight;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Movement")
	float WalkSpeed = 460.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Movement")
	float SprintSpeed = 820.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Look")
	float MouseSensitivity = 1.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Look")
	float GamepadLookRate = 140.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat")
	float MaxHealth = 100.f;

	/** Two body shots or one to the head. */
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat")
	float BodyDamage = 55.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat")
	float ShotRange = 14000.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat")
	float RegenPerSecond = 4.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat")
	float RegenDelay = 5.f;

	/** Falling past this Z puts the player back at the spawn point. */
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Safety")
	float FallRecoveryZ = -1200.f;

private:
	void BuildInputBindings();
	/** Colour is applied in BeginPlay, not here: tinting during construction
	 *  would write the material onto the class default object. */
	UStaticMeshComponent* AddBodyPart(const TCHAR* Name, USceneComponent* Parent, const FVector& Location, const FVector& HalfExtent, const FRotator& Rotation);

	void Move(const FInputActionValue& Value);
	void Look(const FInputActionValue& Value);
	void LookRate(const FInputActionValue& Value);
	void StartSprint();
	void StopSprint();
	void ToggleCrouch();
	void ToggleFlashlight();
	void FireWeapon();
	void ReloadWeapon();

	/** Traces from the view point and applies damage to whatever it finds. */
	void ResolveShot();

	/** Walk cycle, aim pitch and the slump when down. */
	void UpdateBody(float DeltaSeconds);

	void CheckForFall();
	void ReportSilentInput();

	UPROPERTY(Transient) TObjectPtr<ARevolver> Revolver;

	// Body parts. Tinted in BeginPlay, animated in UpdateBody.
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Torso;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Coat;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Head;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Hair;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Beard;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> BeardTaper;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Moustache;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> GunArm;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> FreeArm;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> LeftLeg;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> RightLeg;

	UPROPERTY(Transient) TObjectPtr<UInputMappingContext> InputContext;
	UPROPERTY(Transient) TObjectPtr<UInputAction> MoveAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> LookAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> LookRateAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> JumpAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> SprintAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> CrouchAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> FireAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> ReloadAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> FlashlightAction;

	FTimerHandle FallCheckTimer;
	FTimerHandle InputWatchdogTimer;

	float Health = 100.f;
	float TimeSinceDamage = 0.f;
	float DamageFlash = 0.f;
	float HitMarker = 0.f;
	float GaitPhase = 0.f;
	float GaitBlend = 0.f;
	bool bLastHitHeadshot = false;
	bool bDown = false;
	bool bReceivedAnyInput = false;
};
