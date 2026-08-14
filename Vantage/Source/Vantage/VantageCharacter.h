#pragma once

#include "CoreMinimal.h"
#include "Engine/EngineTypes.h"
#include "GameFramework/Character.h"
#include "VantageCharacter.generated.h"

class ACodeLock;
class ARevolver;
class ARobotDog;
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
 * Built from engine primitives, since there is no skeletal mesh in this project.
 * Limbs are real two-bone chains - hip to knee to ankle, shoulder to elbow to
 * hand - so the walk has actual joints rather than swinging rigid planks.
 *
 * His Enhanced Input assets are built with NewObject at
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
	bool IsSprinting() const { return bSprinting; }
	float GetHealth() const { return Health; }
	float GetMaxHealth() const { return MaxHealth; }
	ARevolver* GetRevolver() const { return Revolver; }
	ARobotDog* GetDog() const { return Dog; }

	/** The lock the player is currently working, or null. */
	ACodeLock* GetActiveLock() const { return ActiveLock; }

	/** Text prompt for whatever is in reach, or empty. */
	FText GetReachPrompt() const;

	float GetDamageFlash() const { return DamageFlash; }
	float GetHitMarker() const { return HitMarker; }
	bool WasLastHitHeadshot() const { return bLastHitHeadshot; }

	/** Puts the player back on their feet at the given spot. */
	void Revive(const FVector& At);

protected:
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Camera") TObjectPtr<USpringArmComponent> SpringArm;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Camera") TObjectPtr<UCameraComponent> Camera;

	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> BodyRoot;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> AimPivot;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> GunHand;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USpotLightComponent> Flashlight;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Movement") float WalkSpeed = 460.f;
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Movement") float SprintSpeed = 880.f;

	/** Field of view at a walk, and how much wider it goes at a sprint. */
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Movement") float BaseFieldOfView = 90.f;
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Movement") float SprintFieldOfView = 103.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Look") float MouseSensitivity = 1.f;
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Look") float GamepadLookRate = 140.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat") float MaxHealth = 100.f;
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat") float BodyDamage = 55.f;
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat") float ShotRange = 14000.f;
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat") float RegenPerSecond = 4.f;
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat") float RegenDelay = 5.f;

	/** How far he can reach to use a lock. */
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Combat") float UseRange = 260.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Safety") float FallRecoveryZ = -1200.f;

private:
	void BuildInputBindings();

	/** A pivot to rotate a limb segment about. Bones hang below it along -Z. */
	USceneComponent* AddJoint(const TCHAR* Name, USceneComponent* Parent, const FVector& Offset, const FRotator& Rotation = FRotator::ZeroRotator);

	/** A box hanging from a joint, its top edge at the joint's origin. */
	UStaticMeshComponent* AddBone(const TCHAR* Name, USceneComponent* Joint, const FVector& HalfExtent, const FVector& Offset = FVector::ZeroVector);

	/** A box positioned directly, for the parts that never articulate. */
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
	void UseOrConfirm();
	void CancelLock();

	/** Dial nudges. They do nothing unless a lock is open. */
	void DialUp();
	void DialDown();
	void DialLeft();
	void DialRight();

	/** The lock in front of him, if any. */
	ACodeLock* FindLockInReach() const;

	void ResolveShot();
	void UpdateBody(float DeltaSeconds);
	void CheckForFall();
	void ReportSilentInput();

	UPROPERTY(Transient) TObjectPtr<ARevolver> Revolver;
	UPROPERTY(Transient) TObjectPtr<ARobotDog> Dog;
	UPROPERTY(Transient) TObjectPtr<ACodeLock> ActiveLock;

	// Torso, head and the beard, which never articulate.
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Torso;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Coat;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Head;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Hair;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Beard;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> BeardTaper;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Moustache;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> HatBrim;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> HatCrown;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> HatBand;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Collar;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> LeftTail;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> RightTail;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> Belt;

	// Two-bone limbs. The joints rotate; the bones just hang off them.
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> LeftHip;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> LeftKnee;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> RightHip;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> RightKnee;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> GunShoulder;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> GunElbow;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> FreeShoulder;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<USceneComponent> FreeElbow;

	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> LeftThigh;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> LeftShin;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> LeftFoot;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> RightThigh;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> RightShin;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> RightFoot;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> GunUpperArm;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> GunForearm;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> FreeUpperArm;
	UPROPERTY(VisibleAnywhere, Category = "Vantage|Body") TObjectPtr<UStaticMeshComponent> FreeForearm;

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
	UPROPERTY(Transient) TObjectPtr<UInputAction> UseAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> DialUpAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> DialDownAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> DialLeftAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> DialRightAction;

	FTimerHandle FallCheckTimer;
	FTimerHandle InputWatchdogTimer;

	float Health = 100.f;
	float TimeSinceDamage = 0.f;
	float DamageFlash = 0.f;
	float HitMarker = 0.f;
	float GaitPhase = 0.f;
	float GaitBlend = 0.f;
	float SprintBlend = 0.f;
	bool bSprinting = false;
	bool bLastHitHeadshot = false;
	bool bDown = false;
	bool bReceivedAnyInput = false;
};
