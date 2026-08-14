#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "RobotDog.generated.h"

class AZombieCharacter;
class UPointLightComponent;
class UStaticMeshComponent;

UENUM()
enum class EDogState : uint8
{
	/** Trotting along behind the player. */
	Heel,
	/** Running down a shambler. */
	Hunt,
	/** Knocked out, rebooting. */
	Rebooting
};

/**
 * A small four legged robot that follows the gunslinger and runs down zombies.
 *
 * It picks the nearest live zombie inside LeashRange of the player - leashing to
 * the player rather than to itself is what stops it wandering off across the
 * desert after something it happened to notice.
 */
UCLASS()
class VANTAGE_API ARobotDog : public ACharacter
{
	GENERATED_BODY()

public:
	ARobotDog();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	EDogState GetState() const { return State; }
	bool IsRebooting() const { return State == EDogState::Rebooting; }

	/** Called by a zombie that swats it. */
	void TakeZombieHit(float Damage);

	UPROPERTY(EditDefaultsOnly, Category = "Dog") float MaxHealth = 60.f;
	UPROPERTY(EditDefaultsOnly, Category = "Dog") float BiteDamage = 34.f;
	UPROPERTY(EditDefaultsOnly, Category = "Dog") float BiteRange = 115.f;
	UPROPERTY(EditDefaultsOnly, Category = "Dog") float BiteInterval = 0.85f;

	/** How far from the *player* a zombie can be and still be worth chasing. */
	UPROPERTY(EditDefaultsOnly, Category = "Dog") float LeashRange = 2200.f;

	/** How close it tries to stay when there is nothing to chase. */
	UPROPERTY(EditDefaultsOnly, Category = "Dog") float HeelDistance = 220.f;

	UPROPERTY(EditDefaultsOnly, Category = "Dog") float RebootSeconds = 9.f;

private:
	UStaticMeshComponent* AddPart(const TCHAR* Name, USceneComponent* Parent, const FVector& Location, const FVector& HalfExtent, const FRotator& Rotation, UStaticMesh* Mesh);

	/** Nearest live zombie within LeashRange of the player, or null. */
	AZombieCharacter* FindQuarry() const;

	void Heel(float DeltaSeconds);
	void Hunt(float DeltaSeconds, AZombieCharacter* Quarry);
	void Animate(float DeltaSeconds);

	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<USceneComponent> BodyRoot;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<UStaticMeshComponent> Chassis;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<UStaticMeshComponent> Plate;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<USceneComponent> Neck;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<UStaticMeshComponent> Head;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<UStaticMeshComponent> Snout;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<UStaticMeshComponent> Jaw;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<UStaticMeshComponent> Tail;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<UStaticMeshComponent> Antenna;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<UPointLightComponent> Eye;

	/** Front left, front right, rear left, rear right. */
	UPROPERTY(VisibleAnywhere, Category = "Dog") TArray<TObjectPtr<USceneComponent>> LegJoints;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TArray<TObjectPtr<UStaticMeshComponent>> LegBones;

	UPROPERTY(Transient) TObjectPtr<UMaterialInstanceDynamic> EyeMaterial;
	UPROPERTY(VisibleAnywhere, Category = "Dog") TObjectPtr<UStaticMeshComponent> EyeLens;

	EDogState State = EDogState::Heel;

	float Health = 60.f;
	float Gait = 0.f;
	float BiteCooldown = 0.f;
	float BiteLunge = 0.f;
	float RebootLeft = 0.f;
	float TailWag = 0.f;
};
